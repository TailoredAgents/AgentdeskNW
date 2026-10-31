import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,Role} from '../lib/contracts';
import type {PropertyRelease} from '../lib/intelligence-contracts';
import type {HandoffBoard,HandoffItem,HandoffMutation,HandoffRecord} from '../lib/handoff-contracts';
import {AppError,assertActor,audit,getDb,newId,now,requireRole} from './db';
import {featureAccess,requireFeature} from './billing';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=z.string().trim().min(1).max(150),text=z.string().trim().min(6).max(1500);
const base={eventKey:id,expectedVersion:z.number().int().nonnegative(),expectedReleaseVersion:z.number().int().positive()};
export const handoffMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('assign'),assignedTo:id,nextAction:text,dueAt:z.string().datetime({offset:true})}).strict(),
 z.object({...base,action:z.literal('acknowledge')}).strict(),
 z.object({...base,action:z.literal('report'),kind:z.enum(['blocked','resolved']),note:text,evidence:text}).strict(),
 z.object({...base,action:z.literal('resolve'),note:text}).strict(),
]);
export const handoffMethod={id:'handoff-follow-through',version:1,source:'AgentDesk provisional management method · 2026-10-30.1',notice:'Fictional operational records. Seven days is a provisional review window, not company policy. No tracked acknowledgment means no acknowledgment recorded here. An outcome report is not verified deal progress.'};
type ReleaseRow={id:string;owner_id:string;data:string};
function members(actor:Actor){return getDb().prepare('SELECT m.user_id AS id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? ORDER BY m.user_id').all(actor.organizationId,actor.officeId) as {id:string;name:string;role:Role}[];}
function rowFor(actor:Actor,releaseId:string){const row=getDb().prepare('SELECT id,owner_id,data FROM property_releases WHERE id=? AND organization_id=? AND office_id=?').get(id.parse(releaseId),actor.organizationId,actor.officeId) as ReleaseRow|undefined;if(!row)throw new AppError(404,'This handoff is not available in your workspace.');return row;}
function stored(actor:Actor,releaseId:string){const row=getDb().prepare('SELECT data FROM handoff_coordination WHERE organization_id=? AND office_id=? AND release_id=?').get(actor.organizationId,actor.officeId,releaseId) as {data:string}|undefined;return row?JSON.parse(row.data) as HandoffRecord:null;}
function visible(actor:Actor,row:ReleaseRow,record:HandoffRecord|null){const release=JSON.parse(row.data) as PropertyRelease;return actor.role==='manager'||record?.assignedTo===actor.id&&(row.owner_id===actor.id||release.authorizedUserIds.includes(actor.id));}
function project(actor:Actor,row:ReleaseRow):HandoffItem {
 const release=JSON.parse(row.data) as PropertyRelease,record=stored(actor,row.id),people=members(actor);
 if(!visible(actor,row,record))throw new AppError(404,'This handoff is not available in your workspace.');
 const sourceChanged=!!record&&record.releaseVersion!==release.version,active=release.status==='released';
 const eligible=people.filter(person=>person.id===row.owner_id||release.authorizedUserIds.includes(person.id));
 const assignee=people.find(person=>person.id===record?.assignedTo),assigneeEligible=!!record&&eligible.some(person=>person.id===record.assignedTo);
 const closingSoon=!!release.closingAt&&Date.parse(release.closingAt)<=Date.now()+7*86400000;
 const attention:HandoffItem['attention']=sourceChanged||!active||!!record&&!assigneeEligible?'source_changed':record?.state==='resolved'?'resolved':record?.state==='blocked'?'blocked':record?.state==='reported'?'review':record&&Date.parse(record.dueAt)<Date.now()?'overdue':closingSoon?'closing_soon':!record?'untracked':'waiting';
 const evidence=[`Release v${release.version} · ${release.status} · ${release.source}`,`Release owner: ${people.find(p=>p.id===row.owner_id)?.name??'Unavailable member'}`,release.closingAt?`Recorded closing target: ${release.closingAt}. This does not establish an agreed or completed closing.`:'No closing target recorded.'];
 if(!record)evidence.push('No coordination assignment or acknowledgment is recorded here.');
 else {evidence.push(`Follow-up v${record.version} applies to release v${record.releaseVersion}; due ${record.dueAt}.`,record.acknowledgedAt?`Assigned employee acknowledged at ${record.acknowledgedAt}.`:'The assigned employee has not recorded an acknowledgment here.');if(record.outcome)evidence.push(`Employee-reported ${record.outcome.kind}: ${record.outcome.note}`,`Supplied evidence reference: ${record.outcome.evidence}`);if(sourceChanged)evidence.push('The release changed after this assignment. Earlier acknowledgment and outcomes do not resolve the new version.');if(!assigneeEligible)evidence.push('The assigned employee no longer has current release access. Review the assignment.');}
 const nextStep=attention==='source_changed'?'Review the current release and create a fresh assignment if it is released.':attention==='resolved'?'This follow-up is resolved; assess transaction progress separately.':attention==='review'?'Review the reported outcome and its evidence before resolving this follow-up.':attention==='blocked'?'Clarify the blocker with the responsible employee and agree the next step.':!record?'Assign a specific next step to an employee who already has access.':!record.acknowledgedAt?'Ask the assigned employee to acknowledge this version and report what is missing.':'Obtain an outcome with a source reference; a completed personal reminder is not sufficient.';
 const actions:HandoffItem['actions']=[];
 if(active&&featureAccess(actor,'core').allowed){if(actor.role==='manager'&&featureAccess(actor,'team-performance').allowed){actions.push('assign');if(!sourceChanged&&assigneeEligible&&record?.state==='reported'&&record.outcome?.kind==='resolved')actions.push('resolve');}if(record?.assignedTo===actor.id&&!sourceChanged&&assigneeEligible&&record.state!=='resolved'){if(!record.acknowledgedAt)actions.push('acknowledge');else actions.push('report');}}
 const history=record?(getDb().prepare('SELECT e.data,e.action,u.name AS actorName FROM handoff_events e JOIN users u ON u.id=e.actor_id WHERE e.organization_id=? AND e.office_id=? AND e.handoff_id=? ORDER BY e.rowid DESC LIMIT 30').all(actor.organizationId,actor.officeId,record.id) as {data:string;action:string;actorName:string}[]).map(e=>({actorName:e.actorName,action:e.action,record:JSON.parse(e.data) as HandoffRecord})):[];
 return {releaseId:release.id,releaseVersion:release.version,address:release.property.address,source:release.source,releasedAt:release.releasedAt,closingAt:release.closingAt,stage:release.downstreamStage||release.upstreamStage||'No stage recorded',releaseStatus:release.status,owner:{id:row.owner_id,name:people.find(p=>p.id===row.owner_id)?.name??'Unavailable member'},record,assigneeName:assignee?.name??null,sourceChanged,attention,evidence,nextStep,eligibleAssignees:actor.role==='manager'?eligible:[],actions,history};
}
export function getHandoff(actor:Actor,releaseId:string){assertActor(actor);return project(actor,rowFor(actor,releaseId));}
export function getHandoffBoard(actor:Actor):HandoffBoard {
 assertActor(actor);const rows=getDb().prepare('SELECT id,owner_id,data FROM property_releases WHERE organization_id=? AND office_id=? ORDER BY id').all(actor.organizationId,actor.officeId) as ReleaseRow[];
 const items=rows.filter(row=>{const record=stored(actor,row.id);return visible(actor,row,record)&&((JSON.parse(row.data) as PropertyRelease).status==='released'||!!record);}).map(row=>project(actor,row));
 const ranks={source_changed:0,blocked:1,overdue:2,review:3,closing_soon:4,untracked:5,waiting:6,resolved:7};items.sort((a,b)=>ranks[a.attention]-ranks[b.attention]||a.address.localeCompare(b.address));
 const handoffAccessReference=hash({actor:[actor.organizationId,actor.officeId,actor.id,actor.role,actor.name],method:handoffMethod,items});
 return {items,checkedAt:now(),handoffAccessReference,summary:`${items.length} authorized handoff${items.length===1?'':'s'}; ${items.filter(i=>i.attention!=='resolved'&&i.attention!=='waiting').length} need review. Follow-up resolution is separate from transaction progress.`,method:handoffMethod};
}
export function handoffReferenceCurrent(actor:Actor,reference:string){return getHandoffBoard(actor).handoffAccessReference===reference;}
export function mutateHandoff(actor:Actor,releaseId:string,raw:HandoffMutation):HandoffItem {
 assertActor(actor);requireFeature(actor,'core');const input=handoffMutationSchema.parse(raw);
 if(input.action==='assign'||input.action==='resolve'){requireRole(actor,['manager']);requireFeature(actor,'team-performance');}
 return getDb().transaction(()=>{
  const current=getHandoff(actor,releaseId),record=current.record;
  const prior=getDb().prepare('SELECT payload_hash,handoff_id FROM handoff_events WHERE organization_id=? AND office_id=? AND actor_id=? AND event_key=?').get(actor.organizationId,actor.officeId,actor.id,input.eventKey) as {payload_hash:string;handoff_id:string}|undefined;
  const payloadHash=hash({releaseId,input});
  if(prior){if(prior.payload_hash!==payloadHash||prior.handoff_id!==record?.id)throw new AppError(409,'This action key already belongs to a different handoff decision.');return current;}
  if(current.releaseVersion!==input.expectedReleaseVersion||(record?.version??0)!==input.expectedVersion)throw new AppError(409,'This handoff changed. Review its current version before deciding.');
  if(!current.actions.includes(input.action))throw new AppError(403,'This action is not available for the current handoff and employee.');
  const stamp=now();let next:HandoffRecord;
  if(input.action==='assign'){
   if(!current.eligibleAssignees.some(p=>p.id===input.assignedTo))throw new AppError(422,'Choose an employee with current access to this release.');
   if(Date.parse(input.dueAt)<=Date.now())throw new AppError(422,'Choose a future follow-up deadline.');
   next={id:record?.id??newId('handoff'),releaseId,releaseVersion:current.releaseVersion,version:(record?.version??0)+1,assignedTo:input.assignedTo,assignedBy:actor.id,nextAction:input.nextAction,dueAt:input.dueAt,state:'assigned',acknowledgedAt:null,outcome:null,resolution:null,createdAt:record?.createdAt??stamp,updatedAt:stamp};
  }else{
   if(!record)throw new AppError(409,'Assign the follow-up first.');next={...record,version:record.version+1,updatedAt:stamp};
   if(input.action==='acknowledge'){next.acknowledgedAt=stamp;next.state='acknowledged';}
   if(input.action==='report'){next.outcome={kind:input.kind,note:input.note,evidence:input.evidence,reportedBy:actor.id,reportedAt:stamp};next.state=input.kind==='blocked'?'blocked':'reported';next.resolution=null;}
   if(input.action==='resolve'){next.state='resolved';next.resolution={note:input.note,reviewedBy:actor.id,reviewedAt:stamp};}
  }
  getDb().prepare('INSERT INTO handoff_coordination(id,organization_id,office_id,release_id,data) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,office_id,release_id) DO UPDATE SET data=excluded.data').run(next.id,actor.organizationId,actor.officeId,releaseId,JSON.stringify(next));
  getDb().prepare('INSERT INTO handoff_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(newId('handoff_event'),actor.organizationId,actor.officeId,actor.id,input.eventKey,payloadHash,next.id,input.action,JSON.stringify(next),stamp);
  audit(actor,`handoff.${input.action}`,next.id,{version:next.version,releaseVersion:next.releaseVersion});return getHandoff(actor,releaseId);
 }).immediate();
}
