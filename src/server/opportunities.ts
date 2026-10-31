import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {Opportunity,OpportunityInput,OpportunityDetail,OpportunityAssessment,OpportunityPreview,OpportunityBoard} from '../lib/opportunity-contracts';
import {AppError,audit,getDb,newId,now,requireRole} from './db';
import {billingPolicy,featureAccess,requireFeature} from './billing';
import {readProperties} from './access';
import {acquisitionSubmissionSchema} from './acquisition-schema';

export const opportunityMethod='AgentDesk provisional wholesaler intake · v2 · 2026-10-31.1';
const text=z.string().trim().max(2000);
export const opportunityInputSchema=z.object({
 address:z.string().trim().min(5).max(240),city:z.string().trim().min(2).max(100),county:z.string().trim().max(100),
 state:z.string().trim().regex(/^[A-Z]{2}$/),postalCode:z.string().trim().regex(/^(\d{5}(-\d{4})?)?$/),propertyType:z.string().trim().max(100),
 submission:acquisitionSubmissionSchema,closingTarget:z.iso.date().nullable(),accessNotes:text,
 status:z.enum(['reviewing','not_pursuing']),reviewNote:text,
}).strict().refine(input=>input.status!=='not_pursuing'||input.reviewNote.length>=6,'Record why this opportunity is not being pursued.');
export const opportunityPreviewSchema=z.object({id:z.string().min(1).max(100).nullable(),expectedVersion:z.number().int().nonnegative(),input:opportunityInputSchema}).strict();
export const opportunitySaveSchema=opportunityPreviewSchema.extend({eventKey:z.string().min(1).max(100),reviewReference:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id,actor.role];
function readable(actor:Actor){requireRole(actor,['acquisitions','manager']);if(billingPolicy(actor).restricted.includes('acquisition-lead'))throw new AppError(403,'Opportunity access is restricted by organization policy.');}
function authorize(actor:Actor){readable(actor);requireFeature(actor,'core');requireFeature(actor,'acquisition-lead');}
function records(actor:Actor):Opportunity[] {
 readable(actor);
 return (getDb().prepare('SELECT owner_id,data FROM acquisition_opportunities WHERE organization_id=? AND office_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId) as {owner_id:string;data:string}[])
  .filter(row=>actor.role==='manager'||row.owner_id===actor.id).map(row=>JSON.parse(row.data) as Opportunity);
}
function record(actor:Actor,id:string):Opportunity {const value=records(actor).find(item=>item.id===id);if(!value)throw new AppError(404,'Opportunity not found in your authorized workspace.');return value;}
const normalize=(value:string)=>value.toLowerCase().normalize('NFKC').replace(/[.,]/g,'').replace(/\bstreet\b/g,'st').replace(/\bavenue\b/g,'ave').replace(/\broad\b/g,'rd').replace(/\blane\b/g,'ln').replace(/\bdrive\b/g,'dr').replace(/\s+/g,' ').trim();
function duplicates(actor:Actor,input:OpportunityInput,id:string|null):OpportunityAssessment['duplicates'] {
 const address=normalize(input.address),city=normalize(input.city);
 const own=records(actor).filter(item=>item.id!==id&&normalize(item.address)===address&&normalize(item.city)===city&&item.state===input.state);
 const inventory=readProperties(actor).filter(item=>normalize(item.address)===address&&normalize(item.city)===city);
 return [...own.map(item=>({id:item.id,kind:'opportunity' as const,address:item.address,reason:`Same normalized address, city and state · ${item.status} · version ${item.version}. Review the existing record before saving a separate submission.`})),...inventory.map(item=>({id:item.id,kind:'inventory' as const,address:item.address,reason:'Same normalized address and city in authorized inventory; state is unavailable in inventory, so this is only a possible match.'}))];
}
export function assessOpportunity(actor:Actor,input:OpportunityInput,id:string|null):OpportunityAssessment {
 readable(actor);const s=input.submission,questions:OpportunityAssessment['questions']=[];
 const ask=(field:string,question:string,reason:string)=>questions.push({field,question,reason});
 if(!s.reportedOn)ask('sourceDate','When were these terms supplied, and are they still current?','The source date is unknown.');
 else if(s.reportedOn<new Date(Date.now()-30*86400000).toISOString().slice(0,10))ask('sourceFreshness','Can you reconfirm the current asking price and availability?','The supplied date is over 30 days old. This provisional review window is not company policy.');
 if(s.askingPrice===null)ask('price','What asking price, fees and terms are being proposed?','Price is not supplied.');
 if(!input.propertyType||!input.county)ask('property','Can you confirm the property type and county?','Location/type context is incomplete.');
 if(s.repairEstimate===null||!s.repairScope||!s.repairSource)ask('repairs','Can you share the repair scope, estimate source/date and supporting material?','A supplied estimate without scope and source is not enough for screening.');
 if(!s.comparableSources)ask('comparables','Which sold comparables support the expectations, with sources and dates?','No comparable references were supplied.');
 if(s.occupancy==='unknown'||!input.accessNotes)ask('access','Is the property occupied, and who can confirm inspection access and restrictions?','Occupancy or access arrangements remain unknown.');
 if(!input.closingTarget)ask('closing','What closing target is proposed, and what supports it?','No target was supplied.');
 else if(input.closingTarget<now().slice(0,10))ask('closing','What is the updated closing target?','The supplied target has passed.');
 const matches=duplicates(actor,input,id);
 if(matches.length)ask('duplicate','Is this a revised submission for an existing opportunity, or a separate opportunity?','An authorized record has a possible matching address. Records are never merged automatically.');
 // Resolve identity/current terms before using a lower-impact completeness question.
 const priority=['duplicate','sourceFreshness','sourceDate','price','repairs','access','comparables','property','closing'];
 questions.sort((a,b)=>priority.indexOf(a.field)-priority.indexOf(b.field));
 const summary=input.status==='not_pursuing'?'Recorded as not pursuing. This is an internal employee decision, not a verified property outcome.':`${questions.length} questions to resolve before supported screening. Supplied facts remain unverified.`;
 return {questions,duplicates:matches,summary,method:opportunityMethod,notice:'Fictional pre-inventory opportunity. Sources are employee-recorded text, not fetched or verified. No property listing, valuation, offer, release, message or payment is created.',followupDraft:[`DRAFT — ${input.address}, ${input.city}`,`Source: ${s.wholesaler} · ${s.sourceReference}`,input.status==='not_pursuing'?`Internal review note: ${input.reviewNote}`:'Please help confirm the following before we complete our review:',...(input.status==='not_pursuing'?[]:questions.filter(q=>q.field!=='duplicate').slice(0,3).map(q=>`• ${q.question}`)),input.status==='reviewing'&&questions.filter(q=>q.field!=='duplicate').length>3?'Additional review questions remain in the opportunity checklist. Start with these decision-changing items.':'',questions.length===0?'The recorded fields are supplied. Review the original evidence, comparable relevance and current terms before a decision.':'','Draft only. Review recipients and wording before any delivery.'].filter(Boolean).join('\n')};
}
export function getOpportunityBoard(actor:Actor):OpportunityBoard {const items=records(actor);return {items,canEdit:featureAccess(actor,'core').allowed&&featureAccess(actor,'acquisition-lead').allowed,opportunityAccessReference:`board@${hash({scope:scope(actor),method:opportunityMethod,items,inventory:readProperties(actor),day:now().slice(0,10)})}`};}
export function opportunityContextReference(actor:Actor):string {return actor.role==='dispositions'||!featureAccess(actor,'acquisition-lead').allowed||!featureAccess(actor,'core').allowed?'unavailable':getOpportunityBoard(actor).opportunityAccessReference;}
export function getOpportunity(actor:Actor,id:string):OpportunityDetail {
 const opportunity=record(actor,id),assessment=assessOpportunity(actor,opportunity,id);
 const history=(getDb().prepare('SELECT data FROM acquisition_opportunity_events WHERE organization_id=? AND office_id=? AND opportunity_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId,id) as {data:string}[]).map(row=>JSON.parse(row.data) as Opportunity);
 const fields=(value:OpportunityInput)=>({...value,...value.submission,submission:undefined});
 const previous=history.find(item=>item.version<opportunity.version),current=fields(opportunity),prior=previous?fields(previous):null;
 const changes=prior?Object.entries(current).filter(([key,value])=>!['id','version','createdAt','updatedAt','ownerId','synthetic','submission'].includes(key)&&value!==prior[key as keyof typeof prior]).map(([field,value])=>({field,before:String(prior[field as keyof typeof prior]??'Not supplied'),after:String(value??'Not supplied')})):[];
 const detail={opportunity,...assessment,history:history.slice(0,20).map(item=>({version:item.version,recordedAt:item.updatedAt,input:opportunityInputSchema.parse(Object.fromEntries(Object.entries(item).filter(([key])=>!['id','ownerId','version','createdAt','updatedAt','synthetic'].includes(key))))})),changes};
 return {...detail,opportunityAccessReference:`${id}@${hash({scope:scope(actor),detail})}`};
}
export function opportunityReferenceCurrent(actor:Actor,reference:string):boolean {
 try {const id=reference.split('@')[0];return (id==='board'?getOpportunityBoard(actor):getOpportunity(actor,id)).opportunityAccessReference===reference;}
 catch(error){if(error instanceof AppError&&[402,403,404].includes(error.status))return false;throw error;}
}
export function previewOpportunity(actor:Actor,raw:z.input<typeof opportunityPreviewSchema>):OpportunityPreview {
 authorize(actor);const input=opportunityPreviewSchema.parse(raw);
 const current=input.id?record(actor,input.id):null;
 if((current?.version??0)!==input.expectedVersion)throw new AppError(409,'This opportunity changed. Reload before reviewing a revision.');
 const assessment=assessOpportunity(actor,input.input,input.id);
 return {...input,...assessment,reviewReference:hash({scope:scope(actor),input,current,assessment})};
}
export function saveOpportunity(actor:Actor,raw:z.input<typeof opportunitySaveSchema>):OpportunityDetail {
 authorize(actor);const input=opportunitySaveSchema.parse(raw);
 return getDb().transaction(()=>{
  const payloadHash=hash(input),prior=getDb().prepare('SELECT payload_hash,opportunity_id FROM acquisition_opportunity_events WHERE organization_id=? AND office_id=? AND actor_id=? AND event_key=?').get(actor.organizationId,actor.officeId,actor.id,input.eventKey) as {payload_hash:string;opportunity_id:string}|undefined;
  if(prior){if(prior.payload_hash!==payloadHash)throw new AppError(409,'This request already belongs to another opportunity revision.');return getOpportunity(actor,prior.opportunity_id);}
  const preview=previewOpportunity(actor,{id:input.id,expectedVersion:input.expectedVersion,input:input.input});
  if(preview.reviewReference!==input.reviewReference)throw new AppError(409,'The opportunity review or duplicate evidence changed. Review again before saving.');
  const previous=input.id?record(actor,input.id):null,stamp=now();
  const value:Opportunity={...input.input,id:previous?.id??newId('opportunity'),ownerId:previous?.ownerId??actor.id,version:(previous?.version??0)+1,createdAt:previous?.createdAt??stamp,updatedAt:stamp,synthetic:true};
  if(previous)getDb().prepare('UPDATE acquisition_opportunities SET data=? WHERE id=? AND organization_id=? AND office_id=?').run(JSON.stringify(value),value.id,actor.organizationId,actor.officeId);
  else getDb().prepare('INSERT INTO acquisition_opportunities VALUES(?,?,?,?,?)').run(value.id,actor.organizationId,actor.officeId,actor.id,JSON.stringify(value));
  getDb().prepare('INSERT INTO acquisition_opportunity_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('opportunity_event'),actor.organizationId,actor.officeId,actor.id,input.eventKey,payloadHash,value.id,JSON.stringify(value),stamp);
  audit(actor,'opportunity.revision.saved',value.id);return getOpportunity(actor,value.id);
 }).immediate();
}
