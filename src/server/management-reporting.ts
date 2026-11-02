import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,Role,Task,ManagementReport,ManagementQuery,ManagementEvidence,ManagementMetricId} from '../lib/contracts';
import {managementMetricIds} from '../lib/management-contracts';
import {AppError,getDb,isAuthorizedActor,now,requireRole} from './db';
import {featureAccess,requireFeature} from './billing';
import {readInvestorRow,readInvestors,readProperties} from './access';
import {getHandoffBoard} from './handoffs';
import {assessOpportunity,getOpportunityBoard} from './opportunities';

export const managementQuerySchema=z.object({role:z.enum(['dispositions','acquisitions','manager']).nullable().optional(),employeeId:z.string().min(1).max(150).nullable().optional(),metric:z.enum(managementMetricIds).nullable().optional(),offset:z.number().int().min(0).max(1000000).nullable().optional()}).strict();
const definitions:Record<ManagementMetricId,[string,string]>={
 relationships:['Investor relationships','Current permitted office investor records, attributed to their recorded owner. A workload count, not buyers converted.'],
 followups:['Open buyer follow-ups','Open tasks linked to a currently permitted investor in this office. Personal-only reminders are excluded.'],
 overdue:['Overdue follow-ups','Open buyer follow-ups with a recorded due time earlier than this report. Undated work is not overdue.'],
 opportunities:['Opportunities in review','Current pre-inventory submissions marked reviewing. Supplied information is not verified inventory or an acquired deal.'],
 blocked:['Blocked handoffs','Current active assigned handoffs with an employee-reported blocker. May overlap other handoff signals.'],
 review:['Awaiting manager review','Current active handoffs with a reported completion awaiting a separate manager resolution. Attributed to the assigned employee; the next decision belongs to management.'],
 unassigned:['Unassigned handoffs','Active released properties or reviewing opportunities without an assignment. Attributed to the source owner.'],
 changed:['Changed handoff sources','Tracked handoffs whose source version, availability or assignment access changed. Excluded from current blocked/review/resolved counts.'],
 resolved:['Resolved follow-ups','Current handoffs with a separately recorded manager resolution. This does not establish a sale, closing, title clearance or transaction outcome.'],
 inventory:['Inventory records','Current permitted office property records, whatever their recorded status. No employee sales attribution is inferred.'],
};
const emptyCounts=()=>Object.fromEntries(managementMetricIds.map(id=>[id,0])) as Record<ManagementMetricId,number>;
const attentionOrder:Record<ManagementEvidence['kind'],number>={handoff:0,followup:1,opportunity:2,relationship:3,inventory:4};

/** Business-source allowlist only. No private job, mailbox, conversation, file or practice reads. */
export function getManagementReport(actor:Actor,raw:ManagementQuery={}):ManagementReport {
 requireRole(actor,['manager']);requireFeature(actor,'team-performance');
 const query=managementQuerySchema.parse(raw);
 return getDb().transaction(():ManagementReport=>{
  const checkedAt=now(),db=getDb();
  const people=(db.prepare('SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? ORDER BY u.name,u.id').all(actor.organizationId,actor.officeId) as {id:string;name:string;role:Role}[])
   .filter(person=>isAuthorizedActor({...actor,...person}));
  if(query.employeeId&&!people.some(person=>person.id===query.employeeId))throw new AppError(404,'This employee is unavailable in your current office.');
  const members=new Map(people.map(person=>[person.id,person]));
  const attribution=(id:string|null)=>{const person=id?members.get(id):undefined;return {ownerId:person?.id??null,ownerName:person?.name??'Office / owner unavailable',role:person?.role??null};};
  const rows:ManagementEvidence[]=[],sourceVersions:unknown[]=[];
  const officeInvestors=readInvestors(actor).filter(investor=>readInvestorRow(actor,investor.id).office_id===actor.officeId);
  const investorIds=new Set(officeInvestors.map(item=>item.id));
  for(const investor of officeInvestors){
   const owner=readInvestorRow(actor,investor.id).owner_id;
   rows.push({key:`relationship:${investor.id}`,kind:'relationship',title:investor.name,...attribution(owner),status:'Recorded relationship',dueAt:null,reason:'Current office CRM ownership; no activity or conversion is inferred.',nextStep:'Open the current relationship before deciding on outreach.',metrics:['relationships'],destination:{kind:'investor',id:investor.id}});
   sourceVersions.push(['investor',investor,owner]);
  }
  const taskRows=db.prepare('SELECT id,owner_id,data FROM tasks WHERE organization_id=? AND office_id=? ORDER BY id').all(actor.organizationId,actor.officeId) as {id:string;owner_id:string;data:string}[];
  for(const row of taskRows){
   const task=JSON.parse(row.data) as Task;
   if(!task.investorId||!investorIds.has(task.investorId)||task.status!=='open')continue;
   const overdue=!!task.dueAt&&Date.parse(task.dueAt)<Date.parse(checkedAt);
   rows.push({key:`followup:${row.id}`,kind:'followup',title:task.title,...attribution(row.owner_id),status:overdue?'Overdue':task.dueAt?'Open':'No due time recorded',dueAt:task.dueAt,reason:overdue?'The recorded due time has passed; a reply or completed contact is not established.':'A business-linked follow-up is open; its completion would not prove a customer response.',nextStep:'Review the relationship and coordinate the next step with its task owner.',metrics:overdue?['followups','overdue']:['followups'],destination:{kind:'investor',id:task.investorId}});
   sourceVersions.push(['task',row.id,row.owner_id,task]);
  }
  const opportunitiesAvailable=featureAccess(actor,'core').allowed&&featureAccess(actor,'acquisition-lead').allowed;
  if(opportunitiesAvailable){
   const board=getOpportunityBoard(actor);sourceVersions.push(board.opportunityAccessReference);
   for(const opportunity of board.items.filter(item=>item.status==='reviewing')){
    const assessment=assessOpportunity(actor,opportunity,opportunity.id);
    rows.push({key:`opportunity:${opportunity.id}`,kind:'opportunity',title:opportunity.address,...attribution(opportunity.ownerId),status:`In review · v${opportunity.version}`,dueAt:null,reason:assessment.questions.length?`${assessment.questions.length} recorded information gaps. ${assessment.questions[0].reason}`:'Recorded fields supplied; independent diligence is still required.',nextStep:assessment.questions[0]?.question??'Review supporting evidence before a release decision.',metrics:['opportunities'],destination:{kind:'opportunity',id:opportunity.id}});
   }
  }
  const board=getHandoffBoard(actor);sourceVersions.push(board.handoffAccessReference);
  for(const item of board.items){
   const metrics:ManagementMetricId[]=[],active=['released','reviewing'].includes(item.releaseStatus);
   if(item.sourceChanged)metrics.push('changed');
   else if(active){if(!item.record)metrics.push('unassigned');else if(item.record.state==='blocked')metrics.push('blocked');else if(item.record.state==='reported')metrics.push('review');else if(item.record.state==='resolved')metrics.push('resolved');}
   rows.push({key:`handoff:${item.releaseId}`,kind:'handoff',title:item.address,...attribution(item.record?.assignedTo??item.owner.id),status:item.attention.replaceAll('_',' '),dueAt:item.sourceChanged?null:item.record?.dueAt??null,reason:item.evidence.join(' ').length>4000?`${item.evidence.join(' ').slice(0,4000)}… Excerpt; open the source for full evidence.`:item.evidence.join(' '),nextStep:item.nextStep,metrics,destination:{kind:'handoff',id:item.releaseId}});
  }
  for(const property of readProperties(actor)){
   rows.push({key:`inventory:${property.id}`,kind:'inventory',title:property.address,...attribution(null),status:property.status,dueAt:null,reason:'Current recorded property status; this report does not verify transaction milestones.',nextStep:'Open the current property and release information.',metrics:['inventory'],destination:{kind:'property',id:property.id}});
   sourceVersions.push(['property',property]);
  }
  const counts=(items:ManagementEvidence[])=>{const result=emptyCounts();for(const row of items)for(const id of row.metrics)result[id]++;return result;};
  const employees=people.map(person=>({...person,counts:{...counts(rows.filter(row=>row.ownerId===person.id)),opportunities:opportunitiesAvailable?rows.filter(row=>row.ownerId===person.id&&row.metrics.includes('opportunities')).length:null}}));
  const scoped=rows.filter(row=>(!query.role||row.role===query.role)&&(!query.employeeId||row.ownerId===query.employeeId)),totals=counts(scoped);
  const unresolvedIds=new Set(board.items.filter(item=>['released','reviewing'].includes(item.releaseStatus)&&!item.sourceChanged&&item.record&&item.record.state!=='resolved').map(item=>`handoff:${item.releaseId}`));
  const unresolvedHandoffs=scoped.filter(row=>unresolvedIds.has(row.key)).length;
  const metrics=managementMetricIds.map(id=>({id,label:definitions[id][0],definition:definitions[id][1],value:id==='opportunities'&&!opportunitiesAvailable?null:totals[id],denominator:id==='overdue'?totals.followups:['blocked','review'].includes(id)?unresolvedHandoffs:null}));
  const filtered=scoped.filter(row=>!query.metric||row.metrics.includes(query.metric));
  const priority=(row:ManagementEvidence)=>row.metrics.includes('changed')?0:row.metrics.includes('blocked')?1:row.metrics.includes('review')?2:row.metrics.includes('overdue')?3:row.metrics.includes('unassigned')?4:5;
  filtered.sort((a,b)=>priority(a)-priority(b)||attentionOrder[a.kind]-attentionOrder[b.kind]||(a.dueAt??'9999').localeCompare(b.dueAt??'9999')||a.key.localeCompare(b.key));
  const offset=query.offset??0,size=40;
  const office=(db.prepare('SELECT name FROM offices WHERE id=? AND organization_id=?').get(actor.officeId,actor.organizationId) as {name:string}).name;
  const bindings=process.env.AGENTDESK_AUTH_MODE==='company_oidc'?db.prepare('SELECT user_id,role,version,revoked_at FROM company_identity_bindings WHERE issuer=? AND organization_id=? AND office_id=? ORDER BY user_id,role,version,revoked_at').all(process.env.AGENTDESK_OIDC_ISSUER??'',actor.organizationId,actor.officeId):[];
  const managementAccessReference=createHash('sha256').update(JSON.stringify({version:1,scope:[actor.organizationId,actor.officeId,actor.id,actor.role,actor.name],definitions,bindings,people,rows,sourceVersions,opportunitiesAvailable,office})).digest('hex');
  return {version:1,synthetic:true,checkedAt,office,scope:'Current authorized office business records only',query,managementAccessReference,metrics,employees,records:filtered.slice(offset,offset+size),page:{offset,size,total:filtered.length,hasMore:filtered.length>offset+size},handoffs:{handoffAccessReference:board.handoffAccessReference,summary:board.summary},summary:`${query.role||query.employeeId?'This selection':'Your office'} has ${totals.followups} open buyer follow-ups (${totals.overdue} overdue), ${totals.blocked} blocked handoff${totals.blocked===1?'':'s'} and ${totals.review} reported outcome${totals.review===1?'':'s'} awaiting manager review.`,coverage:{basis:'Current saved fictional records, not a date-range performance comparison. Handoff signals may overlap. Completed tasks and resolved follow-ups do not prove a sale.',opportunities:opportunitiesAvailable?'available':'restricted',excluded:['Private Agent conversations','Private Inbox messages and drafts','Personal-only reminders','Private documents, transactions, saved-job instructions and practice answers'],unavailable:['Comparable period trends','Verified reply and delivery timing','Verified closings, revenue and conversion','Measured time savings or employee performance rankings'],usage:'AI usage is not an employee-performance measure. Personal billing and wallet information are excluded; usage reporting remains in Credits & billing.'}};
 })();
}

export function managementReferenceCurrent(actor:Actor,reference:string):boolean {
 try{return getManagementReport(actor).managementAccessReference===reference;}catch(error){if(error instanceof AppError&&[402,403,404].includes(error.status))return false;throw error;}
}
export function managementContextReference(actor:Actor):string {
 return actor.role==='manager'&&featureAccess(actor,'team-performance').allowed?getManagementReport(actor).managementAccessReference:'unavailable';
}
