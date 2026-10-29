import { z } from 'zod';
import type { Actor, Investor, Property, ProposedAction } from '../lib/contracts';
import type { Debrief, DebriefProposal } from '../lib/intelligence-contracts';
import { AppError, assertActor, audit, getDb, newId, now, requireRole } from './db';
import { createTask, getInvestor, listInvestors, listProperties, proposeInvestorUpdate, proposeNote, summarizeNotes } from './services';
import { composePackage, listPackages, listReleases } from './workflows';
import { addRelationshipEvent } from './intelligence';
import { readProperty, writableInvestor } from './access';

const id=z.string().min(1).max(150);
const createSchema=z.object({recap:z.string().trim().min(20).max(30000),investorId:id.optional(),propertyId:id.optional()}).strict();
const esc=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function inferInvestor(recap:string,investors:Investor[]) {return investors.filter(investor=>new RegExp(`\\b${esc(investor.name)}\\b`,'i').test(recap)||new RegExp(`\\b${esc(investor.name.split(' ')[0])}\\b`,'i').test(recap));}
function inferProperty(recap:string,properties:Property[]) {
 const exact=properties.filter(property=>recap.toLowerCase().includes(property.address.toLowerCase()));
 return exact.length?exact:properties.filter(property=>new RegExp(`\\b${esc(property.city)}\\b`,'i').test(recap));
}
/** Tomorrow is 10am in the office timezone, including DST boundaries. It is a proposed time until requested. */
export function tomorrowEastern(reference=new Date()):string {
 const pieces=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(reference);
 const part=(key:string)=>Number(pieces.find(item=>item.type===key)?.value);
 const target=new Date(Date.UTC(part('year'),part('month')-1,part('day')+1,10));
 let instant=target.getTime();
 for(let n=0;n<2;n++){
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const p=(key:string)=>Number(local.find(item=>item.type===key)?.value);
  const represented=Date.UTC(p('year'),p('month')-1,p('day'),p('hour'),p('minute'),p('second'));
  instant+=target.getTime()-represented;
 }
 return new Date(instant).toISOString();
}
function extractCriteria(recap:string,investor:Investor|null,otherInvestors:Investor[]=[]) {
 const changes:Record<string,unknown>={},excerpts:Record<string,string>={};const ambiguities:string[]=[];
 const statements=recap.split(/\n|(?<=[.!?])\s+/).map(line=>line.trim()).filter(Boolean);
 const permitted=statements.filter(line=>{
  if(otherInvestors.some(other=>new RegExp(`\\b${esc(other.name.split(' ')[0])}\\b`,'i').test(line)))return false;
  if(otherInvestors.length&&(!investor||!new RegExp(`\\b${esc(investor.name.split(' ')[0])}\\b`,'i').test(line)))return false;
  if(line.endsWith('?')||/\b\w+n['’]t\b/i.test(line)||/\b(no|not|never|without|avoids?|refuses?|declined|rejected|cannot|unsure|maybe|might|could|undecided)\b/i.test(line))return false;
  const speaker=line.match(/^([^:]{1,60}):\s*/)?.[1];
  if(speaker)return /^(investor|buyer)$/i.test(speaker)||!!investor&&[investor.name,investor.name.split(' ')[0]].some(name=>name.toLowerCase()===speaker.toLowerCase());
  if(/\b(I am|I'm|I want|I prefer|I buy|I can|I offered|I suggested|we recommend|we offer)\b/i.test(line))return false;
  return /\b(he|she|they|his|her|their|investor|buyer|wants|prefers|buying|budget)\b/i.test(line)||!!investor&&new RegExp(`\\b${esc(investor.name.split(' ')[0])}\\b`,'i').test(line);
 });
 const attributed=permitted.join(' ');
 const priceStatements=[...attributed.matchAll(/\b(?:under|up to|maximum|less than)\s*\$?[\d,.]+\s*(?:k|m|thousand|million)?/gi)];
 if(priceStatements.length>1||/\b(flip|flips|flipping)\b/i.test(attributed)&&/\b(rental|rentals|buy.and.hold)\b/i.test(attributed))return {changes,excerpts,ambiguities:['Several buying profiles or price limits were mentioned. Create separate reviewed buy boxes instead of merging these criteria.']};
 const set=(key:string,value:unknown,line:string)=>{if(key in changes&&JSON.stringify(changes[key])!==JSON.stringify(value)){delete changes[key];delete excerpts[key];ambiguities.push(`Conflicting ${key} statements need review.`);}else if(!ambiguities.some(item=>item.includes(key))){changes[key]=value;excerpts[key]=line;}};
 for(const line of permitted){
  const maximum=line.match(/\b(?:under|up to|maximum|max(?:imum)? budget(?: is)?|less than|budget(?: of| is)?)\s*\$?([\d,]+(?:\.\d+)?)\s*(k|m|thousand|million)?\b/i);
  if(maximum){const multiplier=/^(k|thousand)$/i.test(maximum[2]??'')?1000:/^(m|million)$/i.test(maximum[2]??'')?1000000:1;const amount=Number(maximum[1].replaceAll(',',''))*multiplier;if(amount>0&&amount<=1e8)set('budgetMax',amount,line);}
  if(/\b(cash|all.cash)\b/i.test(line))set('financing','Cash',line);
  else if(/\bhard.money\b/i.test(line))set('financing','Hard money',line);
  if(/\b(cosmetic|light rehabs?|light renovation)\b/i.test(line))set('rehab','Light / cosmetic',line);
  else if(/\bheavy (rehabs?|renovation)\b/i.test(line))set('rehab','Heavy',line);
  if(/\b(fix.and.flip|flips?|flipping)\b/i.test(line))set('strategy','Fix & flip',line);
  else if(/\b(buy.and.hold|rentals?)\b/i.test(line))set('strategy','Buy & hold',line);
  const counties=['Cobb','Cherokee','Fulton','DeKalb','Bartow','Gwinnett','Clayton','Douglas','Paulding','Forsyth'].filter(county=>new RegExp(`\\b${county}\\b`,'i').test(line));
  if(counties.length&&/\b(buys?|buying|wants?|prefers?|target|looking|counties|county)\b/i.test(line))set('counties',counties,line);
 }
 if(investor&&typeof changes.budgetMax==='number'&&changes.budgetMax<investor.budgetMin){delete changes.budgetMax;delete excerpts.budgetMax;ambiguities.push('The stated maximum is below the recorded minimum; clarify the complete budget before changing it.');}
 return {changes,excerpts,ambiguities};
}
function buildDebrief(actor:Actor,recap:string,investorId?:string,propertyId?:string):Omit<Debrief,'id'|'createdAt'|'proposedActionIds'> {
 const investors=investorId?[getInvestor(actor,investorId)]:inferInvestor(recap,listInvestors(actor));const investor=investors.length===1?investors[0]:null;
 const properties=propertyId?[readProperty(actor,propertyId)]:inferProperty(recap,listProperties(actor));const property=properties.length===1?properties[0]:null;
 const otherInvestors=investor?inferInvestor(recap,listInvestors(actor)).filter(other=>other.id!==investor.id):[];
 const extraction=extractCriteria(recap,investor,otherInvestors);const ambiguities=[...extraction.ambiguities];
 if(otherInvestors.length)ambiguities.push('Another investor is mentioned. Only statements naming the selected investor were extracted; review omitted pronouns and attribution before approval.');
 if(!investor)ambiguities.push(investors.length>1?'More than one investor matches. Select the correct investor.':'Select the investor for this recap.');
 if(properties.length>1)ambiguities.push('More than one property matches. Select the correct release.');
 if(!property&&/\b(photo|property|house|deal)\b/i.test(recap))ambiguities.push('Select the property before preparing requested details.');
 const summary=summarizeNotes(actor,recap);
 const fieldLabels:Record<string,string>={budget:'budgetMax',locations:'counties',strategy:'strategy',financing:'financing',rehab:'rehab',timeframe:'timeframe'};
 summary.missingInformation=Object.entries(fieldLabels).filter(([,field])=>!(field in extraction.changes)).map(([label])=>label);
 summary.suggestedTasks=summary.commitments.map(commitment=>`Review and confirm commitment: ${commitment}`);
 if(summary.missingInformation.length)summary.suggestedTasks.push(`Confirm missing qualification details: ${summary.missingInformation.join(', ')}.`);
 // Existing transcript excerpts remain source material. Only the conservative attributed fields are proposed facts.
 summary.criteria=Object.fromEntries(Object.entries(extraction.excerpts));summary.proposedNote=`Employee post-call recap; unverified, pending review.\n\n${recap}\n\nProposed criteria:\n${Object.entries(extraction.excerpts).map(([key,value])=>`${key}: ${value}`).join('\n')||'No unambiguous investor criteria extracted.'}`.slice(0,15000);
 const hasFollowUp=recap.split(/\n|(?<=[.!?])\s+/).some(statement=>/\b(follow[ -]?up|call (?:him|her|them|back|me))\b[^.!?\n]*\btomorrow\b/i.test(statement)&&!/\b\w+n['’]t\b|\b(no|not|never|maybe|might|could|suggested|suggest|possibly)\b/i.test(statement)&&!statement.endsWith('?'));
 const coaching=['Review the original recap and each proposed field before approval.'];
 if(!extraction.changes.financing)coaching.push('Confirm the investor’s funding method if it was not established.');
 if(!extraction.changes.budgetMax)coaching.push('Confirm a complete purchase-price range.');
 if(hasFollowUp)coaching.push('A follow-up was mentioned. Select Create reminder to save it at the proposed time.');
 return {recap,investorId:investor?.id??null,propertyId:property?.id??null,summary,extractedChanges:extraction.changes,sourceExcerpts:extraction.excerpts,ambiguities,suggestedFollowUpAt:hasFollowUp?tomorrowEastern():null,coaching,status:investor?'ready_for_review':'needs_linking'};
}
function getDebriefRow(actor:Actor,debriefId:string) {
 assertActor(actor);id.parse(debriefId);const row=getDb().prepare('SELECT data,proposal_result FROM debriefs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(debriefId,actor.organizationId,actor.officeId,actor.id) as {data:string;proposal_result:string|null}|undefined;
 if(!row)throw new AppError(404,'The debrief was not found in your authorized workspace.');const value=JSON.parse(row.data) as Debrief;if(value.investorId)getInvestor(actor,value.investorId);if(value.propertyId)readProperty(actor,value.propertyId);return {...row,value};
}
export function listDebriefs(actor:Actor):Debrief[] {
 assertActor(actor);return (getDb().prepare('SELECT id FROM debriefs WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId,actor.id) as {id:string}[]).flatMap(row=>{try{return [getDebriefRow(actor,row.id).value];}catch(error){if(error instanceof AppError&&error.status===404)return [];throw error;}});
}
export function createDebrief(actor:Actor,input:{recap:string;investorId?:string;propertyId?:string}):Debrief {
 requireRole(actor,['dispositions','manager']);const parsed=createSchema.parse(input);const value:Debrief={...buildDebrief(actor,parsed.recap,parsed.investorId,parsed.propertyId),id:newId('debrief'),createdAt:now(),proposedActionIds:[]};
 return getDb().transaction(()=>{
  if(value.investorId){writableInvestor(actor,value.investorId);addRelationshipEvent(actor,value.investorId,'debrief',`Unreviewed employee recap: ${value.summary.summary}`,'Employee-supplied recap; not independently verified. Capture time is not a phone-call timestamp.');}
  getDb().prepare('INSERT INTO debriefs VALUES(?,?,?,?,?,NULL)').run(value.id,actor.organizationId,actor.officeId,actor.id,JSON.stringify(value));audit(actor,'debrief.created',value.id,{status:value.status,extractedFields:Object.keys(value.extractedChanges)});return value;
 })();
}
export function proposeDebrief(actor:Actor,debriefId:string,input:{investorId?:string;propertyId?:string;createFollowUp?:boolean}):DebriefProposal {
 requireRole(actor,['dispositions','manager']);const parsed=z.object({investorId:id.optional(),propertyId:id.optional(),createFollowUp:z.boolean().optional()}).strict().parse(input);
 return getDb().transaction(()=>{
  const row=getDebriefRow(actor,debriefId);
  if(row.proposal_result){const previous=JSON.parse(row.proposal_result) as DebriefProposal;return {...previous,package:previous.package?listPackages(actor).find(item=>item.id===previous.package!.id)??null:null};}
  const debrief:Debrief={...row.value,...buildDebrief(actor,row.value.recap,parsed.investorId??row.value.investorId??undefined,parsed.propertyId??row.value.propertyId??undefined)};
  if(!debrief.investorId)throw new AppError(422,'Select the correct investor before preparing changes.');
  if(!row.value.investorId)addRelationshipEvent(actor,debrief.investorId,'debrief',`Unreviewed employee recap: ${debrief.summary.summary}`,'Employee-supplied recap linked during review; not independently verified. Capture time is not a phone-call timestamp.');
  const actions:ProposedAction[]=[proposeNote(actor,debrief.investorId,debrief.summary)];
  if(Object.keys(debrief.extractedChanges).length){
   const action=proposeInvestorUpdate(actor,debrief.investorId,debrief.extractedChanges);
   action.payload={...action.payload,source:'Employee post-call debrief',sourceStatement:debrief.recap.slice(0,5000),sourceExcerpts:Object.values(debrief.sourceExcerpts),debriefId:debrief.id,verification:'extracted'};
   getDb().prepare('UPDATE proposed_actions SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(action),action.id,actor.organizationId,actor.officeId,actor.id);actions.push(action);
  }
  const tasks=parsed.createFollowUp&&debrief.suggestedFollowUpAt?[createTask(actor,{title:`Follow up with ${getInvestor(actor,debrief.investorId).name} about the reviewed recap`,investorId:debrief.investorId,dueAt:debrief.suggestedFollowUpAt})]:[];
  let prepared:DebriefProposal['package']=null;
  if(debrief.propertyId&&/\b(photo|details|send|link)\b/i.test(debrief.recap)){
   const release=listReleases(actor).find(item=>item.propertyId===debrief.propertyId&&item.status==='released');
   if(release)prepared=composePackage(actor,{investorId:debrief.investorId,releaseId:release.id,channel:'personal_text'});
  }
  const result:DebriefProposal={debrief:{...debrief,status:'proposed',proposedActionIds:actions.map(action=>action.id)},actions,tasks,package:prepared};
  getDb().prepare('UPDATE debriefs SET data=?,proposal_result=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(result.debrief),JSON.stringify(result),debriefId,actor.organizationId,actor.officeId,actor.id);
  audit(actor,'debrief.proposed',debriefId,{actions:actions.length,reminders:tasks.length,packageStatus:prepared?.status??null});return result;
 }).immediate();
}
