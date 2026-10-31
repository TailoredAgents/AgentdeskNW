import {buyerShortlistReferenceCurrent} from './buyer-shortlist';
import {assignmentReviewReferenceCurrent} from './assignment-reviews';
import {documentContextReferenceCurrent} from './document-context';
import {teamContextReferenceCurrent} from './transaction-team-context';
import {transactionReferenceCurrent} from './transaction-context';
import {knowledgeReferenceCurrent} from './knowledge';
import {proactiveReferenceCurrent} from './proactive';
import {analysisReferenceCurrent} from './deal-analysis';
import {opportunityReferenceCurrent} from './opportunities';
import {workQuestionReferenceCurrent} from './work-questions';
import {handoffReferenceCurrent} from './handoffs';
import { workRunVisible } from './work-context';
import type { Actor, Artifact, Message } from '../lib/contracts';
import { createHash } from 'node:crypto';
import type { DealPackage, PropertyRelease } from '../lib/intelligence-contracts';
import { AppError, getDb } from './db';
import { featureAccess } from './billing';
import { readInvestor, readProperty } from './access';
import { getDisclosure, isDisclosureReady, listBuyBoxes } from './intelligence';
import { inboxAccessReferenceCurrent } from './communications-context';

export interface HistoryReferences {buyerShortlists?:string[];assignmentReviews?:string[];documentAccess?:string[];transactionTeamAccess?:string[];transactionAccess?:string[];investors:string[];properties:string[];releases:string[];packages:string[];debriefs:string[];inboxThreads:string[];inboxAccess:string[];workRuns?:string[];handoffAccess?:string[];workQuestions?:string[];knowledgeAccess?:string[];updatesAccess?:string[];analysisAccess?:string[];opportunityAccess?:string[]}
export type StoredMessage=Message & {references?:HistoryReferences};
const empty=():HistoryReferences=>({buyerShortlists:[],assignmentReviews:[],documentAccess:[],transactionTeamAccess:[],transactionAccess:[],investors:[],properties:[],releases:[],packages:[],debriefs:[],inboxThreads:[],inboxAccess:[],workRuns:[],handoffAccess:[],workQuestions:[],knowledgeAccess:[],updatesAccess:[],analysisAccess:[],opportunityAccess:[]});
export const criteriaFingerprint=(actor:Actor,investorId:string)=>createHash('sha256').update(JSON.stringify(listBuyBoxes(actor,investorId))).digest('hex');
// Repeated inherited references are validated once per synchronous SQLite read snapshot.
// This cache never survives a read, an awaited provider call or a subsequent mutation.
let readMemo:Map<string,boolean>|null=null;
const checkingReferences=new Set<string>();
export function withHistoryReadSnapshot<T>(read:()=>T):T {
 if(readMemo)return read();
 return getDb().transaction(()=>{readMemo=new Map();try{return read();}finally{readMemo=null;}})();
}
function currentReference(actor:Actor,kind:string,reference:string,check:()=>boolean){
 const key=JSON.stringify([actor.organizationId,actor.officeId,actor.id,actor.role,kind,reference]);
 if(readMemo?.has(key))return readMemo.get(key)!;
 // Derived work must never turn a cost review of itself into circular source authority.
 if(checkingReferences.has(key))return false;
 checkingReferences.add(key);
 try{const visible=check();readMemo?.set(key,visible);return visible;}finally{checkingReferences.delete(key);}
}
/** References come from structured service outputs, never guessed from names in prose. */
export function collectHistoryReferences(actor:Actor,artifacts:Artifact[],inherited:HistoryReferences[]=[],context?:{investors:{id:string}[];properties:{id:string}[]}):HistoryReferences {
 // Withheld content is not supplied as context; do not permanently taint future, freshly authorized turns.
 return withHistoryReadSnapshot(()=>{const refs=empty();for(const prior of inherited.filter(value=>historyReferencesVisible(actor,value)))for(const key of Object.keys(refs) as (keyof HistoryReferences)[])refs[key]!.push(...(prior[key]??[]));
 if(context){refs.investors.push(...context.investors.map(item=>item.id));refs.properties.push(...context.properties.map(item=>item.id));}
 const visit=(value:unknown,depth=0)=>{
  if(depth>15||value===null||typeof value!=='object')return;
  if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
   if(typeof item==='string'){
    if(key==='investorId'||key==='id'&&/^investor[-_]/.test(item))refs.investors.push(item);
    if(key==='propertyId'||key==='id'&&/^property[-_]/.test(item))refs.properties.push(item);
    if(key==='releaseId'||key==='id'&&/^release_/.test(item))refs.releases.push(item);
    if(key==='id'&&/^package_/.test(item))refs.packages.push(item);
    if(key==='id'&&/^debrief_/.test(item))refs.debriefs.push(item);
    if((key==='threadId'||key==='id')&&/^inbox_thread_/.test(item))refs.inboxThreads.push(item);
    if(key==='workRunId')refs.workRuns!.push(Number.isInteger((value as Record<string,unknown>).workPlanVersion)?`${item}@${(value as Record<string,unknown>).workPlanVersion}`:item);
    if(key==='questionReference'&&typeof (value as Record<string,unknown>).workRunId==='string')refs.workQuestions!.push(`${(value as Record<string,unknown>).workRunId}@${item}`);
    if(key==='buyerShortlistReference')refs.buyerShortlists!.push(item);
    if(key==='assignmentReviewReference')refs.assignmentReviews!.push(item);
    if(key==='documentAccessReference')refs.documentAccess!.push(item);
    if(key==='transactionTeamAccessReference')refs.transactionTeamAccess!.push(item);
    if(key==='transactionAccessReference')refs.transactionAccess!.push(item);
    if(key==='knowledgeAccessReference')refs.knowledgeAccess!.push(item);
    if(key==='updatesAccessReference')refs.updatesAccess!.push(item);
    if(key==='analysisAccessReference')refs.analysisAccess!.push(item);
    if(key==='opportunityAccessReference')refs.opportunityAccess!.push(item);
    if(key==='handoffAccessReference')refs.handoffAccess!.push(item);
    if(key==='inboxAccessReference')refs.inboxAccess.push(item);
   }else visit(item,depth+1);
  }
 };
 visit(artifacts.filter(artifact=>artifact.type!=='marketplace'));
 for(const artifact of artifacts){
  if(artifact.type==='work_run'&&artifact.id){const data=artifact.data as {workPlanVersion?:number}|undefined;refs.workRuns!.push(Number.isInteger(data?.workPlanVersion)?`${artifact.id}@${data!.workPlanVersion}`:artifact.id);}
  if(artifact.type==='briefing'&&artifact.id)refs.investors.push(artifact.id);
  if(artifact.type==='inbox'&&artifact.id)refs.inboxThreads.push(artifact.id);
  if(artifact.type==='approval'&&artifact.id){const row=getDb().prepare('SELECT data FROM proposed_actions WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(artifact.id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;if(row)visit(JSON.parse(row.data));}
 }
 for(const key of Object.keys(refs) as (keyof HistoryReferences)[])refs[key]=[...new Set(refs[key]??[])];
 refs.packages=refs.packages.filter(id=>{const row=getDb().prepare('SELECT data FROM deal_packages WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;return !row||(JSON.parse(row.data) as DealPackage).status!=='blocked';});
 return refs;});
}
function releaseRecord(actor:Actor,id:string):PropertyRelease {
 const row=getDb().prepare('SELECT owner_id,data FROM property_releases WHERE id=? AND organization_id=? AND office_id=?').get(id,actor.organizationId,actor.officeId) as {owner_id:string;data:string}|undefined;
 if(!row)throw new AppError(404,'Release unavailable.');const release=JSON.parse(row.data) as PropertyRelease;
 if(actor.role!=='manager'&&row.owner_id!==actor.id&&!release.authorizedUserIds.includes(actor.id))throw new AppError(404,'Release unavailable.');return release;
}
export function historyReferencesVisible(actor:Actor,refs:HistoryReferences) {
 try {
  for(const reference of refs.buyerShortlists??[])if(!currentReference(actor,'buyerShortlists',reference,()=>buyerShortlistReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.assignmentReviews??[])if(!currentReference(actor,'assignmentReviews',reference,()=>assignmentReviewReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.documentAccess??[])if(!currentReference(actor,'documentAccess',reference,()=>documentContextReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.transactionTeamAccess??[])if(!currentReference(actor,'transactionTeamAccess',reference,()=>teamContextReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.transactionAccess??[])if(!currentReference(actor,'transactionAccess',reference,()=>transactionReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.knowledgeAccess??[])if(!currentReference(actor,'knowledgeAccess',reference,()=>knowledgeReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.updatesAccess??[])if(!currentReference(actor,'updatesAccess',reference,()=>proactiveReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.analysisAccess??[])if(!currentReference(actor,'analysisAccess',reference,()=>analysisReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.opportunityAccess??[])if(!currentReference(actor,'opportunityAccess',reference,()=>opportunityReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.workQuestions??[])if(!currentReference(actor,'workQuestions',reference,()=>workQuestionReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.handoffAccess??[])if(!currentReference(actor,'handoffAccess',reference,()=>handoffReferenceCurrent(actor,reference)))return false;
  for(const reference of refs.workRuns??[]){const [runId,version]=reference.split('@');if(version!==undefined&&!/^[1-9][0-9]*$/.test(version))return false;if(!currentReference(actor,'workRuns',reference,()=>workRunVisible(actor,runId,version===undefined?undefined:Number(version))))return false;}
  if(refs.inboxThreads?.length&&!featureAccess(actor,'core').allowed)return false;
  for(const id of refs.inboxThreads??[]){if(!inboxAccessReferenceCurrent(actor,id,refs.inboxAccess??[]))return false;}
  for(const id of refs.investors)readInvestor(actor,id);
  for(const id of refs.properties)readProperty(actor,id);
  for(const id of refs.releases)releaseRecord(actor,id);
  for(const id of refs.packages){
   const row=getDb().prepare('SELECT data FROM deal_packages WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;if(!row)return false;
   const item=JSON.parse(row.data) as DealPackage & {criteriaFingerprint?:string};readInvestor(actor,item.investorId);const release=releaseRecord(actor,item.releaseId);const disclosure=getDisclosure(actor,item.investorId);
   if(item.criteriaFingerprint&&item.criteriaFingerprint!==criteriaFingerprint(actor,item.investorId))return false;
   if(item.status==='blocked'||release.status!=='released'||release.version!==item.releaseVersion||!isDisclosureReady(disclosure))return false;
   const [templateId,version]=item.templateId.split('@');
   if(!templateId.startsWith('demo-')){const template=getDb().prepare('SELECT data FROM channel_templates WHERE id=? AND organization_id=? AND office_id=?').get(templateId,actor.organizationId,actor.officeId) as {data:string}|undefined;const value=template?JSON.parse(template.data) as {version:number;status:string}:null;if(!value||value.status!=='demo_approved'||value.version!==Number(version))return false;}
   if(release.mediaUrl&&(release.mediaAccess==='unverified'||release.mediaAccess==='recipient_confirmed'&&!release.permittedMediaInvestorIds?.includes(item.investorId)))return false;
  }
  for(const id of refs.debriefs){const row=getDb().prepare('SELECT data FROM debriefs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;if(!row)return false;const item=JSON.parse(row.data) as {investorId:string|null;propertyId:string|null};if(item.investorId)readInvestor(actor,item.investorId);if(item.propertyId)readProperty(actor,item.propertyId);}
  return true;
 }catch(error){if(error instanceof AppError&&(error.status===403||error.status===404))return false;throw error;}
}
export function readHistoryMessage(actor:Actor,message:StoredMessage):Message {
 if(message.references&&!historyReferencesVisible(actor,message.references))return {id:message.id,role:message.role,content:'This historical message is withheld because access or sharing eligibility for a referenced record has changed.',createdAt:message.createdAt,specialistIds:[],artifacts:[]};
 // Navigation opens current scoped services. CRM snapshots are never reissued as current facts from chat storage.
 return {id:message.id,role:message.role,content:message.content,createdAt:message.createdAt,specialistIds:message.specialistIds,artifacts:message.artifacts.map(artifact=>{const {data,...link}=artifact;return artifact.type==='notes'?{...link,data}:link;})};
}

export function assertInboxToolResultVisible(actor:Actor,artifacts:Artifact[]):void {
 const refs=collectHistoryReferences(actor,artifacts);
 if((refs.buyerShortlists?.length||refs.assignmentReviews?.length||refs.documentAccess?.length||refs.transactionTeamAccess?.length||refs.transactionAccess?.length||refs.knowledgeAccess?.length||refs.updatesAccess?.length||refs.inboxThreads.length||refs.workRuns?.length||refs.handoffAccess?.length||refs.workQuestions?.length||refs.opportunityAccess?.length||refs.analysisAccess?.length)&&!historyReferencesVisible(actor,refs))throw new AppError(403,'Access to this result or its source context changed. Retrieve the conversation again.');
}
