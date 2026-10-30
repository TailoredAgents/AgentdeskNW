import {acquisitionSubmissionSchema} from './acquisition-schema';
import { hasFeature,requireFeature } from './billing';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import type { DealPackage, PropertyRelease, ReleaseInput } from '../lib/intelligence-contracts';
import { AppError, assertActor, audit, getDb, newId, now, requireRole } from './db';
import { actorForMember, getInvestor, notify } from './services';
import { getDisclosure, getDisclosurePolicy, isDisclosureReady, compareProperty } from './intelligence';
import { criteriaFingerprint } from './history';
import { readProperty } from './access';

const id=z.string().trim().min(1).max(150);
const text=z.string().trim().max(5000);
const channel=z.enum(['email','sms','personal_text','imessage','slack']);
const mediaUrl=z.string().url().max(2000).refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;},'Use an HTTPS media URL without embedded credentials.').nullable();
export const releaseInputSchema=z.object({acquisitionSubmission:acquisitionSubmissionSchema.optional(),propertyId:id,status:z.enum(['draft','released','withdrawn']),source:z.string().trim().min(1).max(500),eventKey:id,expectedVersion:z.number().int().positive().optional(),propertyType:z.string().trim().max(100),description:text,notes:text,mediaUrl,mediaAccess:z.enum(['unverified','recipient_confirmed','public_confirmed']),permittedMediaInvestorIds:z.array(id).max(500).optional(),arv:z.number().finite().nonnegative().max(1e9).nullable(),repairEstimate:z.number().finite().nonnegative().max(1e9).nullable(),economicsSource:z.string().max(500),showingInstructions:text,authorizedUserIds:z.array(id).max(500),upstreamParty:z.string().max(500),upstreamStage:z.string().max(150),downstreamStage:z.string().max(150),closingStructure:z.enum(['unspecified','single','double','same_day']),closingAt:z.string().datetime({offset:true}).nullable()}).strict();
type StoredRelease=PropertyRelease & {permittedMediaInvestorIds?:string[]};
type ReleaseRow={data:string;owner_id:string};
function mayReadRelease(actor:Actor,row:ReleaseRow) {const release=JSON.parse(row.data) as PropertyRelease;return actor.role==='manager'||row.owner_id===actor.id||release.authorizedUserIds.includes(actor.id);}
function releaseView(actor:Actor,row:ReleaseRow):PropertyRelease {
 const release=JSON.parse(row.data) as PropertyRelease;
 const permittedMediaInvestorIds=release.permittedMediaInvestorIds?.filter(investorId=>{try{getInvestor(actor,investorId);return true;}catch(error){if(error instanceof AppError&&(error.status===403||error.status===404))return false;throw error;}});
 // Match identities are always calculated for the requesting employee, never stored on a shared release.
 return {...release,permittedMediaInvestorIds,matches:release.status==='released'&&actor.role!=='acquisitions'&&hasFeature(actor,'buyer-matchmaker')?compareProperty(actor,release.propertyId):[]};
}
export function listReleases(actor:Actor):PropertyRelease[] {
 assertActor(actor);
 return (getDb().prepare('SELECT data,owner_id FROM property_releases WHERE organization_id=? AND office_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId) as ReleaseRow[]).filter(row=>mayReadRelease(actor,row)).map(row=>releaseView(actor,row));
}
export function getRelease(actor:Actor,releaseId:string):PropertyRelease {
 assertActor(actor);id.parse(releaseId);
 const row=getDb().prepare('SELECT data,owner_id FROM property_releases WHERE id=? AND organization_id=? AND office_id=?').get(releaseId,actor.organizationId,actor.officeId) as ReleaseRow|undefined;
 if(!row||!mayReadRelease(actor,row))throw new AppError(404,'The release was not found in your authorized workspace.');
 return releaseView(actor,row);
}
export function saveRelease(actor:Actor,input:ReleaseInput):PropertyRelease {
 requireFeature(actor,'acquisition-disposition');
 requireRole(actor,['acquisitions','manager']);const parsed=releaseInputSchema.parse(input);
 return getDb().transaction(()=>{
  const property=readProperty(actor,parsed.propertyId);
  const payloadHash=createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
  const event=getDb().prepare('SELECT payload_hash,release_id,data FROM release_events WHERE organization_id=? AND office_id=? AND event_key=?').get(actor.organizationId,actor.officeId,parsed.eventKey) as {payload_hash:string;release_id:string;data:string}|undefined;
  if(event){if(event.payload_hash!==payloadHash)throw new AppError(409,'This release event key was already used with different details.');getRelease(actor,event.release_id);return releaseView(actor,{data:event.data,owner_id:actor.id});}
  const row=getDb().prepare('SELECT data,owner_id FROM property_releases WHERE organization_id=? AND office_id=? AND property_id=?').get(actor.organizationId,actor.officeId,property.id) as ReleaseRow|undefined;
  if(row&&actor.role!=='manager'&&row.owner_id!==actor.id)throw new AppError(403,'Only the release owner or an office manager can revise this release.');
  const previous=row?JSON.parse(row.data) as StoredRelease:null;
  const submission=parsed.acquisitionSubmission??previous?.acquisitionSubmission;
  if(parsed.status==='released'&&submission?.askingPrice!==null&&submission?.askingPrice!==undefined&&submission.askingPrice!==property.price)throw new AppError(422,'The supplied asking price differs from inventory. Resolve that difference before publishing this release.');
  if(parsed.status==='released'&&submission?.repairEstimate!==null&&submission?.repairEstimate!==undefined&&submission.repairEstimate!==parsed.repairEstimate)throw new AppError(422,'The supplied repair assumption differs from the release. Review and reconcile it before publishing.');
  if(previous&&parsed.expectedVersion!==previous.version)throw new AppError(409,'The release changed. Reload its current version before saving.');
  if(!previous&&parsed.expectedVersion)throw new AppError(409,'The specified release version does not exist.');
  const audience=[...new Set(parsed.authorizedUserIds)];
  for(const userId of audience){const member=actorForMember(actor.organizationId,actor.officeId,userId);if(member.role!=='dispositions')throw new AppError(422,'Release recipients must be dispositions employees in this office.');}
  const permitted=[...new Set(parsed.permittedMediaInvestorIds??[])];
  for(const investorId of permitted){const exists=getDb().prepare('SELECT 1 FROM investors WHERE id=? AND organization_id=? AND office_id=?').get(investorId,actor.organizationId,actor.officeId);if(!exists)throw new AppError(422,'A media recipient is not in this office.');}
  if(parsed.mediaAccess==='recipient_confirmed'&&!permitted.length)throw new AppError(422,'Select the investors for whom media access was confirmed.');
  const stamp=now();
  const release:StoredRelease={...parsed,...((parsed.acquisitionSubmission??previous?.acquisitionSubmission)?{acquisitionSubmission:parsed.acquisitionSubmission??previous?.acquisitionSubmission}:{}),id:previous?.id??newId('release'),propertyId:property.id,version:(previous?.version??0)+1,property,authorizedUserIds:audience,permittedMediaInvestorIds:permitted,createdAt:previous?.createdAt??stamp,updatedAt:stamp,releasedAt:parsed.status==='released'?stamp:null,matches:[],synthetic:true};
  // Event keys and optimistic versions belong to the command, not to the release record.
  const stored={...release} as StoredRelease & {eventKey?:string;expectedVersion?:number};delete stored.eventKey;delete stored.expectedVersion;
  if(previous)getDb().prepare('UPDATE property_releases SET data=? WHERE id=? AND organization_id=? AND office_id=?').run(JSON.stringify(stored),stored.id,actor.organizationId,actor.officeId);
  else getDb().prepare('INSERT INTO property_releases VALUES(?,?,?,?,?,?)').run(stored.id,actor.organizationId,actor.officeId,actor.id,property.id,JSON.stringify(stored));
  getDb().prepare('INSERT INTO release_events VALUES(?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,parsed.eventKey,payloadHash,stored.id,stored.version,JSON.stringify(stored));
  for(const packageRow of getDb().prepare('SELECT id,data FROM deal_packages WHERE organization_id=? AND office_id=? AND release_id=?').all(actor.organizationId,actor.officeId,stored.id) as {id:string;data:string}[]){
   const value=blockPackage(JSON.parse(packageRow.data) as DealPackage,['The property release changed. Compose and review a new package.']);
   getDb().prepare('UPDATE deal_packages SET data=?,canonical_body=?,canonical_subject=? WHERE id=?').run(JSON.stringify(value),'','',value.id);
  }
  if(stored.status==='released')for(const userId of audience){const recipient=actorForMember(actor.organizationId,actor.officeId,userId);const matches=hasFeature(recipient,'buyer-matchmaker')?compareProperty(recipient,property.id):[];notify(recipient,`release:${stored.id}:${stored.version}`,'Demo property release',`${property.address}: ${matches.filter(match=>match.score>0).length} matches among your permitted investors. Review fit and disclosure before preparing details.`,'properties');}
  audit(actor,'property.release.saved',stored.id,{version:stored.version,status:stored.status,recipients:audience.length,synthetic:true});
  return getRelease(actor,stored.id);
 }).immediate();
}

export interface PackageTemplate {id:string;name:string;channel:DealPackage['channel'];intro:string;closing:string;status:'demo_approved'|'draft';source:string;version:number}
export function listTemplates(actor:Actor):PackageTemplate[] {
 assertActor(actor);const saved=(getDb().prepare('SELECT data FROM channel_templates WHERE organization_id=? AND office_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId) as {data:string}[]).map(row=>JSON.parse(row.data) as PackageTemplate);
 return [...saved,...channel.options.map(format=>({id:`demo-${format}-v1`,name:`Demo ${format.replaceAll('_',' ')} template`,channel:format,intro:'Here are the property details for your review.',closing:'Please confirm your interest and any questions.',status:'demo_approved' as const,source:'Tailored Agents demonstration template; not corporate-approved policy.',version:1}))];
}
export function saveTemplate(actor:Actor,input:{id?:string;name:string;channel:DealPackage['channel'];intro:string;closing:string;approved:boolean}):PackageTemplate {
 requireFeature(actor,'deal-marketing');
 requireRole(actor,['manager']);const parsed=z.object({id:id.optional(),name:z.string().trim().min(1).max(120),channel,intro:z.string().trim().max(400),closing:z.string().trim().max(400),approved:z.boolean()}).strict().parse(input);
 // Template copy is introductory language only; property facts must come from the authorized release.
 for(const copy of [parsed.intro,parsed.closing])if(/https?:|\$|\d|\{\{|\b(guarantee|guaranteed|signed|verified|delivered)\b/i.test(copy))throw new AppError(422,'Use introductory language without property facts, links, placeholders or verification claims.');
 const existing=parsed.id?listTemplates(actor).find(item=>item.id===parsed.id&&!item.id.startsWith('demo-')):undefined;
 if(parsed.id&&!existing)throw new AppError(404,'The editable template was not found in this office.');
 const value:PackageTemplate={id:existing?.id??newId('template'),name:parsed.name,channel:parsed.channel,intro:parsed.intro,closing:parsed.closing,status:parsed.approved?'demo_approved':'draft',source:'Manager-reviewed local demo template; not New Western corporate approval.',version:(existing?.version??0)+1};
 getDb().prepare('INSERT INTO channel_templates VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,actor.organizationId,actor.officeId,actor.id,JSON.stringify(value));audit(actor,'package.template.saved',value.id,{version:value.version,status:value.status});return value;
}
const blockedBody='Property details are withheld. Resolve the eligibility requirements, then compose a new package for review.';
function blockPackage(value:DealPackage,reasons:string[]):DealPackage {return {...value,status:'blocked',subject:'Property information pending eligibility',body:blockedBody,eligibilityReasons:reasons,approvedAt:null,handedOffAt:null,updatedAt:now(),deliveryStatus:'not_sent'};}
function eligibility(actor:Actor,investorId:string,releaseId:string,version?:number) {
 getInvestor(actor,investorId);
 if(!getDb().prepare('SELECT 1 FROM investors WHERE id=? AND organization_id=? AND office_id=?').get(investorId,actor.organizationId,actor.officeId))throw new AppError(403,'Property packages are restricted to investor records in this office.');
 // No restricted property details are assembled until both record access and disclosure checks pass.
 const release=getRelease(actor,releaseId) as StoredRelease;const disclosure=getDisclosure(actor,investorId);const policy=getDisclosurePolicy(actor);const reasons:string[]=[];
 if(release.status!=='released')reasons.push('The property has not been released for distribution.');
 if(version!==undefined&&version!==release.version)reasons.push('The release version changed. Compose a new package.');
 if(disclosure.status!=='signed'||!disclosure.signedAt||!Number.isFinite(Date.parse(disclosure.signedAt))||Date.parse(disclosure.signedAt)>Date.now()||!disclosure.documentRef)reasons.push('A verifiable signed disclosure is required.');
 if(disclosure.version!==policy.version)reasons.push('The required disclosure version has not been completed.');
 if(disclosure.expiresAt&&(!Number.isFinite(Date.parse(disclosure.expiresAt))||Date.parse(disclosure.expiresAt)<=Date.now()))reasons.push('The disclosure has expired.');
 if(!isDisclosureReady(disclosure)&&!reasons.some(reason=>reason.toLowerCase().includes('disclosure')))reasons.push('Disclosure evidence is invalid.');
 if(release.mediaUrl&&release.mediaAccess==='unverified')reasons.push('Confirm the intended recipient can access the media link before preparing it for sharing.');
 if(release.mediaUrl&&release.mediaAccess==='recipient_confirmed'&&!release.permittedMediaInvestorIds?.includes(investorId))reasons.push('Media access has not been confirmed for this investor.');
 return {release,disclosure,reasons};
}
function packageRow(actor:Actor,packageId:string) {
 assertActor(actor);id.parse(packageId);
 const row=getDb().prepare('SELECT data,canonical_body,canonical_subject FROM deal_packages WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(packageId,actor.organizationId,actor.officeId,actor.id) as {data:string;canonical_body:string;canonical_subject:string}|undefined;
 if(!row)throw new AppError(404,'The package was not found in your authorized workspace.');return {...row,value:JSON.parse(row.data) as DealPackage};
}
function persistPackage(actor:Actor,value:DealPackage) {getDb().prepare('UPDATE deal_packages SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(value),value.id,actor.organizationId,actor.officeId,actor.id);return value;}
function recheckPackage(actor:Actor,value:DealPackage):DealPackage {
 try {const check=eligibility(actor,value.investorId,value.releaseId,value.releaseVersion);if(value.disclosureVersion!==check.disclosure.version)check.reasons.push('Disclosure changed. Compose a new package.');if(!listTemplates(actor).some(template=>`${template.id}@${template.version}`===value.templateId&&template.status==='demo_approved'))check.reasons.push('The communication template changed. Compose a new package.');const fingerprint=(value as DealPackage & {criteriaFingerprint?:string}).criteriaFingerprint;if(fingerprint&&fingerprint!==criteriaFingerprint(actor,value.investorId))check.reasons.push('Recorded buying criteria changed. Compose and review a new comparison.');if(check.reasons.length)return persistPackage(actor,blockPackage(value,check.reasons));}
 catch(error){if(error instanceof AppError&&(error.status===404||error.status===403))return persistPackage(actor,blockPackage(value,['Access to the investor or release is no longer authorized.']));throw error;}return value;
}
export function listPackages(actor:Actor):DealPackage[] {
 assertActor(actor);return (getDb().prepare('SELECT data FROM deal_packages WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId,actor.id) as {data:string}[]).map(row=>recheckPackage(actor,JSON.parse(row.data) as DealPackage));
}
export function composePackage(actor:Actor,input:{investorId:string;releaseId:string;channel:DealPackage['channel']}):DealPackage {
 requireFeature(actor,'deal-marketing');
 requireRole(actor,['dispositions','manager']);const parsed=z.object({investorId:id,releaseId:id,channel}).strict().parse(input);
 return getDb().transaction(()=>{
  const check=eligibility(actor,parsed.investorId,parsed.releaseId);const {release,disclosure}=check;
  const template=listTemplates(actor).find(item=>item.channel===parsed.channel&&item.status==='demo_approved')!;
  const stamp=now();let value:DealPackage & {criteriaFingerprint?:string}={id:newId('package'),...parsed,releaseVersion:release.version,status:'draft',subject:'',body:'',missing:[],eligibilityReasons:[],disclosureVersion:disclosure.version,templateId:`${template.id}@${template.version}`,createdAt:stamp,updatedAt:stamp,approvedAt:null,handedOffAt:null,deliveryStatus:'not_sent',synthetic:true};
  if(check.reasons.length)value=blockPackage(value,check.reasons);
  else {
   const investor=getInvestor(actor,parsed.investorId);const property=release.property;const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
   const missing=[!release.description?'deal description':null,!release.mediaUrl?'photo/media link':null,release.arv===null?'ARV assumption':null,release.repairEstimate===null?'repair assumption':null,!release.showingInstructions?'showing instructions':null,!release.economicsSource&&(release.arv!==null||release.repairEstimate!==null)?'economics source':null].filter((item):item is string=>!!item);
   const lines=['DEMONSTRATION ONLY — fictional property; no message has been sent.',`Hi ${investor.name.split(' ')[0]},`,template.intro,`${property.address}, ${property.city} · ${property.county} County`,`Asking price: ${money(property.price)}`,`${property.beds} beds · ${property.baths} baths · ${property.sqft.toLocaleString('en-US')} sq ft`,release.propertyType?`Property type: ${release.propertyType}`:'',`Recorded rehab: ${property.rehab}`,release.description,release.notes?`Deal notes: ${release.notes}`:'',release.arv!==null?`Supplied ARV assumption: ${money(release.arv)}`:'',release.repairEstimate!==null?`Supplied repair assumption: ${money(release.repairEstimate)}`:'',release.economicsSource?`Economics source: ${release.economicsSource}`:'',release.mediaUrl?`Photos: ${release.mediaUrl}`:'',release.mediaUrl?'Media permission was confirmed by an employee; AgentDesk has not tested live access.':'',release.showingInstructions?`Showing / next steps: ${release.showingInstructions}`:'',template.closing,`Source: ${release.source} · release version ${release.version}`].filter(Boolean);
   // Package personalization is shared computation inside Deal Marketing, not a second paid matching operation.
   const comparison=compareProperty(actor,release.propertyId).find(match=>match.investorId===investor.id);
   if(comparison){const beforeSource=lines.length-1;lines.splice(beforeSource,0,...(comparison.reasons.length?[`Recorded profile comparison: ${comparison.reasons.join(' ')}`]:[]),...(comparison.conflicts.length?[`Fit cautions: ${comparison.conflicts.join(' ')}`]:[]));}
   const compact=['sms','personal_text','imessage'].includes(parsed.channel);
   value={...value,subject:parsed.channel==='email'?`Demo property details: ${property.address}`:'Property details for review',body:lines.join(compact?'\n':'\n\n'),missing,criteriaFingerprint:criteriaFingerprint(actor,investor.id)};
  }
  getDb().prepare('INSERT INTO deal_packages VALUES(?,?,?,?,?,?,?,?,?)').run(value.id,actor.organizationId,actor.officeId,actor.id,value.investorId,value.releaseId,JSON.stringify(value),value.status==='blocked'?'':value.body,value.status==='blocked'?'':value.subject);
  audit(actor,'package.composed',value.id,{status:value.status,releaseVersion:value.releaseVersion,channel:value.channel});if(value.status==='draft')notify(actor,`package-review:${value.id}`,'Deal package ready for review','Review the saved demo draft before approving a copy handoff. Nothing has been sent.','properties');return value;
 }).immediate();
}
function validateEdits(body:string,subject:string,canonicalBody:string,canonicalSubject:string) {
 const allowed=new Set(canonicalBody.split('\n'));const lines=body.split('\n');
 if(!canonicalBody||!lines.includes(canonicalBody.split('\n')[0])||lines.some(line=>line.trim()&&!allowed.has(line))||!['',canonicalSubject,'Property details for review'].includes(subject))throw new AppError(422,'Keep factual wording from the source package. You can remove or reorder complete lines; revise property facts in the release before composing again.');
}
export function updatePackage(actor:Actor,packageId:string,input:{body?:string;subject?:string}):DealPackage {
 requireFeature(actor,'deal-marketing');
 requireRole(actor,['dispositions','manager']);return getDb().transaction(()=>{
 const parsed=z.object({body:z.string().min(1).max(20000).optional(),subject:z.string().max(200).optional()}).strict().parse(input);const row=packageRow(actor,packageId);const current=recheckPackage(actor,row.value);
 if(current.status==='blocked')throw new AppError(409,'Resolve eligibility and compose a new package before editing.');
 const body=parsed.body??current.body,subject=parsed.subject??current.subject;validateEdits(body,subject,row.canonical_body,row.canonical_subject);
 const value=persistPackage(actor,{...current,body,subject,status:'draft',approvedAt:null,handedOffAt:null,updatedAt:now()});audit(actor,'package.edited',packageId);return value;
 }).immediate();
}
export function approvePackage(actor:Actor,packageId:string):DealPackage {
 requireFeature(actor,'deal-marketing');
 requireRole(actor,['dispositions','manager']);return getDb().transaction(()=>{
 const row=packageRow(actor,packageId);const value=recheckPackage(actor,row.value);
 if(value.status==='blocked')throw new AppError(409,'This package is blocked. Resolve eligibility and compose a new package.');
 validateEdits(value.body,value.subject,row.canonical_body,row.canonical_subject);
 if(value.status==='approved'||value.status==='handed_off')return value;
 audit(actor,'package.approved',value.id,{releaseVersion:value.releaseVersion});return persistPackage(actor,{...value,status:'approved',approvedAt:now(),updatedAt:now()});
 }).immediate();
}
export function handoffPackage(actor:Actor,packageId:string):{package:DealPackage;text:string;subject:string} {
 requireFeature(actor,'deal-marketing');
 requireRole(actor,['dispositions','manager']);return getDb().transaction(()=>{
 const row=packageRow(actor,packageId);const value=recheckPackage(actor,row.value);
 if(!['approved','handed_off'].includes(value.status))throw new AppError(409,'Review and approve an eligible package before copying.');
 validateEdits(value.body,value.subject,row.canonical_body,row.canonical_subject);
 const result=persistPackage(actor,{...value,status:'handed_off',handedOffAt:value.handedOffAt??now(),updatedAt:now(),deliveryStatus:'not_sent'});audit(actor,'package.copy_handoff',value.id,{channel:value.channel,deliveryStatus:'not_sent'});
 return {package:result,text:result.body,subject:result.subject};
 }).immediate();
}
