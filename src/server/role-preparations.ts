import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import type {HandoffMutation} from '../lib/handoff-contracts';
import {handoffDecisionText} from '../lib/handoff-contracts';
import type {RolePreparation} from '../lib/role-preparation-contracts';
import {AppError,assertActor,audit,getDb,newId,now,requireRole} from './db';
import {requireFeature} from './billing';
import {getOpportunity,getOpportunityBoard,opportunityContextReference,opportunityPreviewSchema,previewOpportunity,saveOpportunity} from './opportunities';
import {getHandoff,getHandoffBoard,handoffMutationSchema,mutateHandoff} from './handoffs';

const id=z.string().min(1).max(150),hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
type OpportunityInput=z.infer<typeof opportunityPreviewSchema>;
type Candidate={kind:'opportunity';input:OpportunityInput}|{kind:'handoff';releaseId:string;input:HandoffMutation};
type Stored=RolePreparation&{candidate:Candidate};
export const roleDecisionSchema=z.object({reference:z.string().length(64),decision:z.enum(['apply','dismiss']),eventKey:id}).strict();
export const handoffPreparationSchema=z.object({releaseId:id,expectedVersion:z.number().int().nonnegative(),expectedReleaseVersion:z.number().int().positive(),action:z.enum(['assign','acknowledge','report','resolve']),assignedTo:id.nullable(),nextAction:z.string().max(1500).nullable(),dueAt:z.string().datetime({offset:true}).nullable(),note:z.string().max(1500).nullable(),evidence:z.string().max(1500).nullable(),reportKind:z.enum(['blocked','resolved']).nullable()}).strict();
function formatFields(value:Record<string,unknown>):string {
 return Object.entries(value).map(([key,item])=>`${key.replace(/([a-z])([A-Z])/g,'$1 $2')}: ${item&&typeof item==='object'?`\n${formatFields(item as Record<string,unknown>)}`:item===null||item===''?'Not supplied':String(item)}`).join('\n');
}
function preview(actor:Actor,candidate:Candidate){
 requireFeature(actor,'core');
 if(candidate.kind==='opportunity'){
  const value=previewOpportunity(actor,candidate.input);
  return {reference:hash({actor:scope(actor),kind:candidate.kind,review:value.reviewReference}),title:`${candidate.input.id?'Revise':'Record'} opportunity · ${value.input.address}`,body:`${formatFields(value.input as unknown as Record<string,unknown>)}\n\n${value.summary}\n${value.duplicates.map(d=>`Possible duplicate: ${d.address}. ${d.reason}`).join('\n')}\n\n${value.followupDraft}`,sourceReference:value.reviewReference};
 }
 const input=handoffMutationSchema.parse(candidate.input),item=getHandoff(actor,candidate.releaseId);
 if(input.action==='assign'||input.action==='resolve'){requireRole(actor,['manager']);requireFeature(actor,'team-performance');}
 if(item.releaseVersion!==input.expectedReleaseVersion||(item.record?.version??0)!==input.expectedVersion)throw new AppError(409,'The handoff changed. Prepare its current version.');
 if(!item.actions.includes(input.action))throw new AppError(403,'This handoff action is not available to this employee.');
 if(input.action==='assign'&&(!item.eligibleAssignees.some(person=>person.id===input.assignedTo)||Date.parse(input.dueAt)<=Date.now()))throw new AppError(422,'Choose an eligible employee and a future deadline.');
 return {reference:hash({actor:scope(actor),candidate,item}),title:`Review handoff · ${item.address}`,body:handoffDecisionText(item,input),sourceReference:''};
}
function read(actor:Actor,id:string):Stored {
 assertActor(actor);const row=getDb().prepare('SELECT data FROM role_preparations WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,...scope(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Prepared action not found in your private workspace.');return JSON.parse(row.data);
}
function visible(actor:Actor,value:Stored):RolePreparation {
 let current=false;
 if(value.candidate.kind==='handoff')getHandoff(actor,value.candidate.releaseId);
 else if(value.candidate.input.id||value.outcomeId)getOpportunity(actor,value.candidate.input.id??value.outcomeId!);
 else getOpportunityBoard(actor);
 if(value.state==='pending')try{current=preview(actor,value.candidate).reference===value.reference;}catch(error){if(!(error instanceof AppError&&[403,409,422].includes(error.status)))throw error;}
 const {candidate:_candidate,...result}=value;void _candidate;
 return {...result,current,body:value.state==='pending'&&!current?'This preparation is no longer current. Ask the Agent to prepare it again using current information.':result.body};
}
export function listRolePreparations(actor:Actor):RolePreparation[]{
 assertActor(actor);return (getDb().prepare('SELECT data FROM role_preparations WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY rowid DESC LIMIT 50').all(...scope(actor)) as {data:string}[]).flatMap(row=>{try{return [visible(actor,JSON.parse(row.data))];}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return [];throw error;}});
}
function prepare(actor:Actor,candidate:Candidate):ToolResult {
 return getDb().transaction(()=>{
  const review=preview(actor,candidate),key=hash({candidate,reference:review.reference}),existing=getDb().prepare('SELECT data FROM role_preparations WHERE organization_id=? AND office_id=? AND owner_id=? AND preparation_key=?').get(...scope(actor),key) as {data:string}|undefined;
  const value:Stored=existing?JSON.parse(existing.data):{id:newId('role_preparation'),kind:candidate.kind,candidate,title:review.title,body:review.body,state:'pending',current:true,reference:review.reference,createdAt:now(),outcomeId:null,notice:'Fictional internal work. Apply only after reviewing the exact details. No external message, listing, transaction milestone or payment is created.'};
  if(!existing){getDb().prepare('INSERT INTO role_preparations VALUES(?,?,?,?,?,?)').run(value.id,...scope(actor),key,JSON.stringify(value));audit(actor,'role.preparation.saved',value.id,{kind:candidate.kind});}
  const data=visible(actor,value),preparedReference={rolePreparationReference:rolePreparationReference(actor,value.id)},reference=candidate.kind==='opportunity'?{opportunityAccessReference:opportunityContextReference(actor)}:{handoffAccessReference:getHandoffBoard(actor).handoffAccessReference};
  return {specialistIds:[candidate.kind==='opportunity'?'acquisition-lead':actor.role==='manager'?'team-performance':'workflow-navigator'],message:data.state==='pending'?`Prepared “${data.title}” for your review in Work. ${candidate.kind==='opportunity'?'The opportunity has not been saved to the business records.':'The shared handoff has not changed.'} Review the supplied details, then apply or dismiss.`:`This exact preparation was already ${data.state}. It has not been repeated.`,data:{preparation:data,...preparedReference,...reference},artifacts:[{type:candidate.kind,id:candidate.kind==='opportunity'?candidate.input.id??undefined:candidate.releaseId,title:'Review prepared action in Work',data:{preparationId:value.id,...preparedReference,...reference}}]};
 }).immediate();
}
export function prepareOpportunityIntake(actor:Actor,input:unknown){return prepare(actor,{kind:'opportunity',input:opportunityPreviewSchema.parse(input)});}
export function prepareHandoffAction(actor:Actor,raw:unknown){
 const input=handoffPreparationSchema.parse(raw),base={eventKey:'prepared',expectedVersion:input.expectedVersion,expectedReleaseVersion:input.expectedReleaseVersion,action:input.action};
 const mutation=handoffMutationSchema.parse(input.action==='assign'?{...base,assignedTo:input.assignedTo,nextAction:input.nextAction,dueAt:input.dueAt}:input.action==='report'?{...base,kind:input.reportKind,note:input.note,evidence:input.evidence}:input.action==='resolve'?{...base,note:input.note}:base);
 return prepare(actor,{kind:'handoff',releaseId:input.releaseId,input:mutation});
}
/** Authenticated employee decision only; intentionally absent from model tools. */
export function decideRolePreparation(actor:Actor,id:string,raw:unknown):RolePreparation {
 const input=roleDecisionSchema.parse(raw);
 return getDb().transaction(()=>{
  const value=read(actor,id),payloadHash=hash({id,input}),prior=getDb().prepare('SELECT payload_hash FROM role_preparation_decisions WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),input.eventKey) as {payload_hash:string}|undefined;
  if(prior){if(prior.payload_hash!==payloadHash)throw new AppError(409,'This decision key belongs to another action.');return visible(actor,value);}
  if(value.state!=='pending'||value.reference!==input.reference)throw new AppError(409,'This prepared action changed or was already decided.');
  const projected=visible(actor,value);requireFeature(actor,'core');
  let outcomeId:string|null=null;
  if(input.decision==='apply'){
   if(!projected.current)throw new AppError(409,'This preparation is stale. Ask the Agent to prepare the current facts.');
   const candidate=value.candidate,eventKey=`role:${id}`;
   if(candidate.kind==='opportunity'){const review=previewOpportunity(actor,candidate.input);outcomeId=saveOpportunity(actor,{...candidate.input,reviewReference:review.reviewReference,eventKey}).opportunity.id;}
   else {mutateHandoff(actor,candidate.releaseId,{...candidate.input,eventKey});outcomeId=candidate.releaseId;}
  }
  const next:Stored={...value,state:input.decision==='apply'?'applied':'dismissed',outcomeId};
  getDb().prepare('UPDATE role_preparations SET data=? WHERE id=?').run(JSON.stringify(next),id);
  getDb().prepare('INSERT INTO role_preparation_decisions VALUES(?,?,?,?,?,?,?,?)').run(newId('role_decision'),id,...scope(actor),input.eventKey,payloadHash,JSON.stringify({input,preparation:value,decidedAt:now(),outcomeId}));audit(actor,'role.preparation.decided',id,{state:next.state});return visible(actor,next);
 }).immediate();
}

export function rolePreparationReference(actor:Actor,id:string):string {const value=visible(actor,read(actor,id));return `${id}|${hash(value)}`;}
export function rolePreparationReferenceCurrent(actor:Actor,reference:string):boolean {try{return rolePreparationReference(actor,reference.split('|')[0])===reference;}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}}
export function rolePreparationContextFingerprint(actor:Actor){return hash(listRolePreparations(actor));}
