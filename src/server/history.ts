import type { Actor, Artifact, Message } from '../lib/contracts';
import { createHash } from 'node:crypto';
import type { DealPackage, PropertyRelease } from '../lib/intelligence-contracts';
import { AppError, getDb } from './db';
import { featureAccess } from './billing';
import { readInvestor, readProperty } from './access';
import { getDisclosure, isDisclosureReady, listBuyBoxes } from './intelligence';
import { inboxAccessReferenceCurrent } from './communications-context';

export interface HistoryReferences {investors:string[];properties:string[];releases:string[];packages:string[];debriefs:string[];inboxThreads:string[];inboxAccess:string[]}
export type StoredMessage=Message & {references?:HistoryReferences};
const empty=():HistoryReferences=>({investors:[],properties:[],releases:[],packages:[],debriefs:[],inboxThreads:[],inboxAccess:[]});
export const criteriaFingerprint=(actor:Actor,investorId:string)=>createHash('sha256').update(JSON.stringify(listBuyBoxes(actor,investorId))).digest('hex');
/** References come from structured service outputs, never guessed from names in prose. */
export function collectHistoryReferences(actor:Actor,artifacts:Artifact[],inherited:HistoryReferences[]=[],context?:{investors:{id:string}[];properties:{id:string}[]}):HistoryReferences {
 // Withheld content is not supplied as context; do not permanently taint future, freshly authorized turns.
 const refs=empty();for(const prior of inherited.filter(value=>allowed(actor,value)))for(const key of Object.keys(refs) as (keyof HistoryReferences)[])refs[key].push(...(prior[key]??[]));
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
    if(key==='inboxAccessReference')refs.inboxAccess.push(item);
   }else visit(item,depth+1);
  }
 };
 visit(artifacts.filter(artifact=>artifact.type!=='marketplace'));
 for(const artifact of artifacts){
  if(artifact.type==='briefing'&&artifact.id)refs.investors.push(artifact.id);
  if(artifact.type==='inbox'&&artifact.id)refs.inboxThreads.push(artifact.id);
  if(artifact.type==='approval'&&artifact.id){const row=getDb().prepare('SELECT data FROM proposed_actions WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(artifact.id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;if(row)visit(JSON.parse(row.data));}
 }
 for(const key of Object.keys(refs) as (keyof HistoryReferences)[])refs[key]=[...new Set(refs[key])];
 refs.packages=refs.packages.filter(id=>{const row=getDb().prepare('SELECT data FROM deal_packages WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;return !row||(JSON.parse(row.data) as DealPackage).status!=='blocked';});
 return refs;
}
function releaseRecord(actor:Actor,id:string):PropertyRelease {
 const row=getDb().prepare('SELECT owner_id,data FROM property_releases WHERE id=? AND organization_id=? AND office_id=?').get(id,actor.organizationId,actor.officeId) as {owner_id:string;data:string}|undefined;
 if(!row)throw new AppError(404,'Release unavailable.');const release=JSON.parse(row.data) as PropertyRelease;
 if(actor.role!=='manager'&&row.owner_id!==actor.id&&!release.authorizedUserIds.includes(actor.id))throw new AppError(404,'Release unavailable.');return release;
}
function allowed(actor:Actor,refs:HistoryReferences) {
 try {
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
 if(message.references&&!allowed(actor,message.references))return {id:message.id,role:message.role,content:'This historical message is withheld because access or sharing eligibility for a referenced record has changed.',createdAt:message.createdAt,specialistIds:[],artifacts:[]};
 // Navigation opens current scoped services. CRM snapshots are never reissued as current facts from chat storage.
 return {id:message.id,role:message.role,content:message.content,createdAt:message.createdAt,specialistIds:message.specialistIds,artifacts:message.artifacts.map(artifact=>{const {data,...link}=artifact;return artifact.type==='notes'?{...link,data}:link;})};
}

export function assertInboxToolResultVisible(actor:Actor,artifacts:Artifact[]):void {
 const refs=collectHistoryReferences(actor,artifacts);
 if(refs.inboxThreads.length&&!allowed(actor,refs))throw new AppError(403,'Access to the inbox result or its relationship context changed. Retrieve the conversation again.');
}
