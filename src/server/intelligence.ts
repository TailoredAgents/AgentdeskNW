import { hasFeature,requireFeature } from './billing';
import { z } from 'zod';
import type { Actor, Investor, ProposedAction, Task } from '../lib/contracts';
import type { BuyBox, BuyerMatch, CallBriefing, CallPriority, Disclosure, InvestorIntelligence, PropertyRelease, RelationshipEvent } from '../lib/intelligence-contracts';
import { AppError, assertActor, audit, getDb, insertRecord, newId, now, requireRole, scopedRows, updateRecord } from './db';
import { defaultAccess, getOwnershipPolicy, readInvestor, readInvestorRow, readInvestors, readProperty, writableInvestor } from './access';
import { normalizePropertyType, strategiesMatch } from './research';
import {reviewBuyerGeography} from './buyer-geography';

export const DISCLOSURE_VERSION='demo-disclosure-v1';
export function getDisclosurePolicy(actor:Actor) {assertActor(actor);return {disclosureRequired:true,version:DISCLOSURE_VERSION,source:'Conservative local demo policy; company policy and approved disclosure document require confirmation.'} as const;}
type StoredIntelligence=Omit<InvestorIntelligence,'investor'|'buyBoxes'|'history'>;
const stringList=z.array(z.string().trim().min(1).max(150)).max(30);
const amount=z.number().finite().min(0).max(100_000_000).nullable();
export const buyBoxInputSchema=z.object({
 label:z.string().trim().min(1).max(150).optional(),states:stringList.optional(),counties:stringList.optional(),cities:stringList.optional(),zipCodes:stringList.optional(),excludedAreas:stringList.optional(),geographicFlexibility:z.boolean().optional(),
 priceMin:amount.optional(),priceMax:amount.optional(),arvMin:amount.optional(),arvMax:amount.optional(),propertyTypes:stringList.optional(),sqftMin:amount.optional(),sqftMax:amount.optional(),bedsMin:amount.optional(),bathsMin:amount.optional(),strategies:stringList.optional(),rehabLevels:stringList.optional(),financing:stringList.optional(),active:z.boolean().optional(),
 source:z.string().trim().min(1).max(300).default('Employee review'),sourceStatement:z.string().trim().min(1).max(5000),expectedVersion:z.number().int().positive().optional(),
}).strict();
export type BuyBoxInput=z.input<typeof buyBoxInputSchema>;
const emptyCriteria={states:[],counties:[],cities:[],zipCodes:[],excludedAreas:[],geographicFlexibility:false,priceMin:null,priceMax:null,arvMin:null,arvMax:null,propertyTypes:[],sqftMin:null,sqftMax:null,bedsMin:null,bathsMin:null,strategies:[],rehabLevels:[],financing:[],active:true};
function inheritedProvenance(box:BuyBox):NonNullable<BuyBox['fieldProvenance']> {return box.fieldProvenance??Object.fromEntries(Object.keys(emptyCriteria).map(key=>[key,box.provenance]));}
function validateRanges(box:BuyBox) {for(const [low,high] of [[box.priceMin,box.priceMax],[box.arvMin,box.arvMax],[box.sqftMin,box.sqftMax]])if(low!==null&&high!==null&&low>high)throw new AppError(422,'The minimum cannot exceed the maximum in a buy box.');}
function defaultDisclosure(investor:Investor):Disclosure {
 const signed=investor.synthetic&&investor.id==='investor-mike';
 return {investorId:investor.id,status:signed?'signed':'unknown',version:DISCLOSURE_VERSION,documentRef:signed?'demo:disclosure-mike-v1':null,source:signed?'Synthetic signed-disclosure fixture; not an executed legal document.':'No disclosure evidence supplied.',updatedAt:now(),signedAt:signed?now():null,expiresAt:null,synthetic:investor.synthetic};
}
function initialize(actor:Actor,investorId:string):StoredIntelligence {
 const row=readInvestorRow(actor,investorId);const investor=JSON.parse(row.data) as Investor;
 if(row.intelligence)return JSON.parse(row.intelligence) as StoredIntelligence;
 const value:StoredIntelligence={...defaultAccess,relationshipSource:investor.synthetic?'Fictional local CRM fixture':'Existing CRM record',salesforceRef:null,qualificationStatus:'Needs confirmation',disclosure:defaultDisclosure(investor),currentActivity:'unknown',activitySource:null,communicationPreference:'Unknown',lastOutcome:null};
 getDb().transaction(()=>{
 getDb().prepare('INSERT OR IGNORE INTO investor_intelligence VALUES(?,?,?,?)').run(investorId,row.organization_id,row.office_id,JSON.stringify(value));
 const box:BuyBox={...emptyCriteria,id:`buybox-primary-${investorId}`,investorId,label:'Primary buying criteria',counties:investor.counties,priceMin:investor.budgetMin||null,priceMax:investor.budgetMax||null,propertyTypes:investor.synthetic&&['investor-mike','investor-sarah','investor-david','investor-jordan-private'].includes(investor.id)?['Single-family']:[],strategies:investor.strategy?[investor.strategy]:[],rehabLevels:investor.rehab?[investor.rehab]:[],financing:investor.financing?[investor.financing]:[],version:1,provenance:{source:'Existing local demo CRM migration',capturedAt:now(),statement:'Preserved existing CRM criteria. Fictional fixtures are not verified investor preferences.',verification:'seeded_demo',reviewStatus:'approved',syncStatus:'local_demo'}};
 box.fieldProvenance=inheritedProvenance(box);
 getDb().prepare('INSERT OR IGNORE INTO buy_boxes VALUES(?,?,?,?,?)').run(box.id,row.organization_id,row.office_id,investorId,JSON.stringify(box));
 })();
 return value;
}
function saveIntelligence(actor:Actor,investorId:string,value:StoredIntelligence) {
 writableInvestor(actor,investorId);
 getDb().prepare('UPDATE investor_intelligence SET data=? WHERE investor_id=? AND organization_id=? AND office_id=?').run(JSON.stringify(value),investorId,actor.organizationId,actor.officeId);
}
export function addRelationshipEvent(actor:Actor,investorId:string,kind:RelationshipEvent['kind'],summary:string,source:string):RelationshipEvent {
 writableInvestor(actor,investorId);
 const event:RelationshipEvent={id:newId('event'),investorId,kind,summary:z.string().max(15000).parse(summary),occurredAt:now(),source:z.string().max(300).parse(source)};
 getDb().prepare('INSERT INTO relationship_events VALUES(?,?,?,?,?,?)').run(event.id,actor.organizationId,actor.officeId,investorId,actor.id,JSON.stringify(event));return event;
}
export function listBuyBoxes(actor:Actor,investorId:string):BuyBox[] {
 initialize(actor,investorId);
 const rows=getDb().prepare('SELECT data FROM buy_boxes WHERE organization_id=? AND investor_id=? ORDER BY rowid').all(actor.organizationId,investorId) as {data:string}[];
 return rows.map(row=>JSON.parse(row.data) as BuyBox);
}
export function isDisclosureReady(disclosure:Disclosure,at=Date.now()):boolean {
 return disclosure.status==='signed'&&disclosure.version===DISCLOSURE_VERSION&&!!disclosure.documentRef&&(!disclosure.synthetic||disclosure.documentRef.startsWith('demo:'))&&!!disclosure.signedAt&&Number.isFinite(Date.parse(disclosure.signedAt))&&Date.parse(disclosure.signedAt)<=at&&(!disclosure.expiresAt||Number.isFinite(Date.parse(disclosure.expiresAt))&&Date.parse(disclosure.expiresAt)>at);
}
export function getDisclosure(actor:Actor,investorId:string):Disclosure {
 const disclosure=initialize(actor,investorId).disclosure;
 return disclosure.expiresAt&&Date.parse(disclosure.expiresAt)<=Date.now()?{...disclosure,status:'expired'}:disclosure;
}
export function getInvestorIntelligence(actor:Actor,investorId:string):InvestorIntelligence {
 const investor=readInvestor(actor,investorId);const data=initialize(actor,investorId);
 const history=(getDb().prepare('SELECT data FROM relationship_events WHERE organization_id=? AND investor_id=? ORDER BY rowid DESC LIMIT 100').all(actor.organizationId,investorId) as {data:string}[]).map(row=>JSON.parse(row.data) as RelationshipEvent);
 return {...data,investor,buyBoxes:listBuyBoxes(actor,investorId),disclosure:getDisclosure(actor,investorId),history};
}
export function listInvestorIntelligence(actor:Actor) {return readInvestors(actor).map(investor=>getInvestorIntelligence(actor,investor.id));}
export function proposeBuyBox(actor:Actor,investorId:string,input:BuyBoxInput|Record<string,unknown>,existingId?:string):ProposedAction {
 requireFeature(actor,'salesforce-assistant');
 const investor=writableInvestor(actor,investorId);const parsed=buyBoxInputSchema.parse(input);const boxes=listBuyBoxes(actor,investorId);
 const existing=existingId?boxes.find(box=>box.id===existingId):undefined;
 if(existingId&&!existing)throw new AppError(404,'This buy box is not in the authorized investor profile.');
 if(existing&&parsed.expectedVersion!==existing.version)throw new AppError(409,'Buying criteria changed. Review the current version before preparing an update.');
 const {source,sourceStatement,expectedVersion,...criteria}=parsed;void expectedVersion;
 const value:BuyBox={...emptyCriteria,...existing,...criteria,id:existing?.id??newId('buybox'),investorId,label:criteria.label??existing?.label??'Additional buying criteria',version:(existing?.version??0)+1,provenance:{source,capturedAt:now(),statement:sourceStatement,verification:'extracted',reviewStatus:'pending',syncStatus:'local_demo',...(existing?{supersedesId:`${existing.id}:v${existing.version}`}:{})}};
 value.fieldProvenance={...(existing?inheritedProvenance(existing):{}),...Object.fromEntries(Object.keys(criteria).map(key=>[key,value.provenance]))};
 validateRanges(value);
 const conflicts=existing?Object.keys(criteria).filter(key=>JSON.stringify(existing[key as keyof BuyBox])!==JSON.stringify(value[key as keyof BuyBox])).map(key=>`${key}: replaces previously recorded criteria; employee review required.`):[];
 const action:ProposedAction={id:newId('action'),kind:'buy_box',title:`Review ${investor.name}’s ${value.label.toLowerCase()}`,status:'pending',payload:{investorId,buyBoxId:value.id,beforeVersion:existing?.version??null,buyBox:value,conflicts},createdAt:now(),executedAt:null,ownerId:actor.id,error:null};
 insertRecord(actor,'proposed_actions',action);audit(actor,'buy_box.proposed',action.id,{conflicts:conflicts.length});return action;
}
/** Called only within the explicit approval transaction, never exposed as a model tool. */
export function applyBuyBoxApproval(actor:Actor,action:ProposedAction):void {
 const payload=z.object({investorId:z.string(),buyBoxId:z.string(),beforeVersion:z.number().int().nullable(),buyBox:z.custom<BuyBox>()}).parse(action.payload);
 writableInvestor(actor,payload.investorId);
 const current=listBuyBoxes(actor,payload.investorId).find(box=>box.id===payload.buyBoxId);
 if((current?.version??null)!==payload.beforeVersion)throw new AppError(409,'Buying criteria changed after this proposal. Prepare a new reviewed update.');
 const approvedProvenance={...payload.buyBox.provenance,verification:'employee_confirmed' as const,reviewStatus:'approved' as const};
 const value:BuyBox={...payload.buyBox,provenance:approvedProvenance,fieldProvenance:Object.fromEntries(Object.entries(payload.buyBox.fieldProvenance??{}).map(([key,provenance])=>[key,provenance.reviewStatus==='pending'?approvedProvenance:provenance]))};
 if(value.investorId!==payload.investorId||value.id!==payload.buyBoxId)throw new AppError(422,'The proposed criteria do not belong to this investor.');
 validateRanges(value);storeBox(actor,value,current);
 if(value.id===`buybox-primary-${value.investorId}`) {
 const investor=writableInvestor(actor,value.investorId);
 updateRecord(actor,'investors',{...investor,counties:value.counties,strategy:value.strategies.join(' / '),budgetMin:value.priceMin??0,budgetMax:value.priceMax??0,rehab:value.rehabLevels.join(', ')||null,financing:value.financing.join(', ')||null});
 }
 addRelationshipEvent(actor,value.investorId,'buy_box',`Approved version ${value.version} of ${value.label}.`,value.provenance.source);
}
function storeBox(actor:Actor,value:BuyBox,previous?:BuyBox) {
 if(previous)getDb().prepare('INSERT INTO buy_box_versions VALUES(?,?,?,?,?,?,?)').run(newId('boxversion'),actor.organizationId,actor.officeId,value.investorId,value.id,previous.version,JSON.stringify(previous));
 getDb().prepare('INSERT INTO buy_boxes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,actor.organizationId,actor.officeId,value.investorId,JSON.stringify(value));
}
/** Compatibility bridge keeps reviewed Phase 1 CRM updates and primary intelligence in sync. */
export function syncPrimaryBuyBox(actor:Actor,investor:Investor,changes:Record<string,unknown>,actionId:string,provenance:Record<string,unknown>={}) {
 const current=listBuyBoxes(actor,investor.id).find(box=>box.id===`buybox-primary-${investor.id}`)!;
 const patch:Partial<BuyBox>={};
 if('counties' in changes)patch.counties=investor.counties;if('strategy' in changes)patch.strategies=[investor.strategy];if('budgetMin' in changes)patch.priceMin=investor.budgetMin||null;if('budgetMax' in changes)patch.priceMax=investor.budgetMax||null;if('rehab' in changes)patch.rehabLevels=investor.rehab?[investor.rehab]:[];if('financing' in changes)patch.financing=investor.financing?[investor.financing]:[];
 if(!Object.keys(patch).length)return;
 const value:BuyBox={...current,...patch,version:current.version+1,provenance:{source:typeof provenance.source==='string'?provenance.source:`Reviewed CRM update ${actionId}`,capturedAt:now(),statement:Array.isArray(provenance.sourceExcerpts)?provenance.sourceExcerpts.filter(item=>typeof item==='string').join('\n').slice(0,5000):JSON.stringify(changes),verification:'employee_confirmed',reviewStatus:'approved',syncStatus:'local_demo',supersedesId:`${current.id}:v${current.version}`}};
 value.fieldProvenance={...inheritedProvenance(current),...Object.fromEntries(Object.keys(patch).map(key=>[key,value.provenance]))};
 validateRanges(value);storeBox(actor,value,current);addRelationshipEvent(actor,investor.id,'buy_box',`Primary buying criteria updated after employee approval (version ${value.version}).`,'Reviewed local CRM update');
}
export function recordDemoDisclosure(actor:Actor,investorId:string,input:{status:Disclosure['status'];version:string;documentRef:string|null;expiresAt?:string|null}):Disclosure {
 requireRole(actor,['manager']);const investor=writableInvestor(actor,investorId);
 if(!investor.synthetic)throw new AppError(403,'The demo adapter accepts synthetic investor records only. A verified disclosure provider is required for real records.');
 const value=z.object({status:z.enum(['unknown','not_requested','prepared','sent','opened','signed','declined','expired']),version:z.string().min(1).max(100),documentRef:z.string().max(500).nullable(),expiresAt:z.string().datetime({offset:true}).nullable().optional()}).strict().parse(input);
 if(value.status==='signed'&&(!value.documentRef?.startsWith('demo:')||value.version!==DISCLOSURE_VERSION))throw new AppError(422,'A signed demo disclosure requires the current demo version and a demo: evidence reference.');
 const data=initialize(actor,investorId);
 const disclosure:Disclosure={...value,investorId,source:'Manager-entered synthetic disclosure fixture; not an executed legal document.',signedAt:value.status==='signed'?now():null,updatedAt:now(),expiresAt:value.expiresAt??null,synthetic:true};
 getDb().transaction(()=>{saveIntelligence(actor,investorId,{...data,disclosure});addRelationshipEvent(actor,investorId,'disclosure',`Synthetic disclosure status: ${value.status}.`,'Demo disclosure adapter');audit(actor,'disclosure.demo_recorded',investorId,{status:value.status});})();return disclosure;
}
export function setInvestorSharing(actor:Actor,investorId:string,input:{visibility:InvestorIntelligence['visibility'];sharedWith:string[]}) {
 requireRole(actor,['manager']);writableInvestor(actor,investorId);
 const value=z.object({visibility:z.enum(['owner','office','organization','shared']),sharedWith:z.array(z.string().min(1).max(150)).max(100)}).strict().parse(input);const policy=getOwnershipPolicy(actor);
 if(value.visibility==='organization'&&!policy.organizationVisibility)throw new AppError(403,'Organization-wide visibility is disabled by the configured ownership policy.');
 for(const id of value.sharedWith){const members=getDb().prepare('SELECT office_id FROM memberships WHERE organization_id=? AND user_id=?').all(actor.organizationId,id) as {office_id:string}[];if(!members.some(member=>member.office_id===actor.officeId||policy.crossOfficeSharing))throw new AppError(403,'A sharing recipient is outside the permitted organization or office.');}
 saveIntelligence(actor,investorId,{...initialize(actor,investorId),...value});audit(actor,'investor.sharing.updated',investorId,{visibility:value.visibility,recipients:value.sharedWith.length});return getInvestorIntelligence(actor,investorId);
}
export function assignInvestor(actor:Actor,investorId:string,ownerId:string) {
 requireRole(actor,['manager']);const investor=writableInvestor(actor,investorId);
 if(!getOwnershipPolicy(actor).managerAssignment)throw new AppError(403,'Manager assignment is disabled by the ownership policy.');
 if(!getDb().prepare('SELECT 1 FROM memberships WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,z.string().max(150).parse(ownerId)))throw new AppError(403,'The new owner must be a member of this office.');
 getDb().transaction(()=>{const data=initialize(actor,investorId);getDb().prepare('UPDATE investors SET owner_id=?,data=? WHERE id=? AND organization_id=? AND office_id=?').run(ownerId,JSON.stringify({...investor,ownerId}),investorId,actor.organizationId,actor.officeId);saveIntelligence(actor,investorId,{...data,visibility:'owner',sharedWith:[]});addRelationshipEvent(actor,investorId,'assignment','Relationship ownership reassigned by an authorized office manager.','Configured demo ownership policy');audit(actor,'investor.assigned',investorId);})();return getInvestorIntelligence(actor,investorId);
}
function authorizedReleases(actor:Actor):PropertyRelease[] {
 assertActor(actor);if(!getDb().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='property_releases'").get())return [];
 return (getDb().prepare('SELECT owner_id,data FROM property_releases WHERE organization_id=? AND office_id=?').all(actor.organizationId,actor.officeId) as {owner_id:string;data:string}[]).filter(row=>{const release=JSON.parse(row.data) as PropertyRelease;return actor.role==='manager'||row.owner_id===actor.id||release.authorizedUserIds.includes(actor.id);}).map(row=>JSON.parse(row.data) as PropertyRelease);
}
function propertyContext(actor:Actor,propertyId:string) {
 const property=readProperty(actor,propertyId);
 const releases=authorizedReleases(actor);const release=releases.find(item=>item.propertyId===propertyId);
 const exists=getDb().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='property_releases'").get();
 if(exists&&!release&&getDb().prepare('SELECT 1 FROM property_releases WHERE organization_id=? AND office_id=? AND property_id=?').get(actor.organizationId,actor.officeId,propertyId))throw new AppError(404,'This property release is not available in your authorized workspace.');
 return {property,propertyType:release?.propertyType??(property.synthetic&&['property-maple','property-cedar','property-oak'].includes(property.id)?'Single-family':''),arv:release?.arv??null,release};
}
function engagement(investor:Investor,data:StoredIntelligence):number {
 let score=investor.lastContactAt?Math.max(0,35-Math.floor((Date.now()-Date.parse(investor.lastContactAt))/86400000)):0;
 if(data.lastOutcome==='interested')score+=35;if(data.lastOutcome==='connected')score+=15;
 if(data.currentActivity==='actively_buying'&&data.activitySource)score+=20;
 if(data.currentActivity==='paused')score=0;
 return Math.min(100,Math.max(0,score));
}
function rehabLevel(value:string):number {const key=value.toLowerCase();return /ground|teardown|rebuild/.test(key)?5:/gut/.test(key)?4:/heavy/.test(key)?3:/medium|moderate/.test(key)?2:/light|cosmetic/.test(key)?1:0;}
function scoreBox(investor:Investor,box:BuyBox,context:ReturnType<typeof propertyContext>,data:StoredIntelligence,disclosure:Disclosure):BuyerMatch {
 const {property,propertyType,arv}=context;let score=0;const reasons:string[]=[],conflicts:string[]=[],missing:string[]=[];
 if(context.release&&JSON.stringify(context.release.property)!==JSON.stringify(property))missing.push('Current inventory differs from the saved release; refresh publication facts before sharing.');
 const geography=reviewBuyerGeography(box,property);
 score+=geography.points;reasons.push(...geography.reasons);conflicts.push(...geography.conflicts);missing.push(...geography.missing);
 if(box.priceMin===null&&box.priceMax===null)missing.push('Confirmed purchase-price range');else if((box.priceMin===null||property.price>=box.priceMin)&&(box.priceMax===null||property.price<=box.priceMax)){score+=25;reasons.push('Asking price is within the recorded purchase range.');}else conflicts.push('Asking price is outside the recorded purchase range.');
 if(!box.propertyTypes.length||!propertyType)missing.push('Property-type preference or property type');else if(box.propertyTypes.some(type=>normalizePropertyType(type)===normalizePropertyType(propertyType))){score+=20;reasons.push('Property type matches the buy box.');}else conflicts.push('Property type conflicts with the buy box.');
 const capacity=Math.max(0,...box.rehabLevels.map(rehabLevel)),required=rehabLevel(property.rehab);
 if(!capacity||!required)missing.push('Confirmed rehab capacity');else if(required<=capacity){score+=15;reasons.push('Rehab requirement is within recorded tolerance.');}else conflicts.push('Property needs more rehab than the recorded tolerance.');
 if(!box.strategies.length)missing.push('Investment strategy');else if(box.strategies.some(strategy=>strategiesMatch(strategy,property.strategy))){score+=15;reasons.push('Investment strategy matches.');}else conflicts.push('Investment strategy conflicts with the buy box.');
 let dimensionsFit=true;
 if((box.sqftMin!==null&&property.sqft<box.sqftMin)||(box.sqftMax!==null&&property.sqft>box.sqftMax)||(box.bedsMin!==null&&property.beds<box.bedsMin)||(box.bathsMin!==null&&property.baths<box.bathsMin)){conflicts.push('Size or bedroom / bathroom criteria conflict.');dimensionsFit=false;}
 if(box.arvMin!==null||box.arvMax!==null){if(arv===null)missing.push('Sourced ARV');else if((box.arvMin!==null&&arv<box.arvMin)||(box.arvMax!==null&&arv>box.arvMax)){conflicts.push('Sourced ARV is outside the recorded target range.');dimensionsFit=false;}else reasons.push('Sourced ARV matches the target range.');}
 if(dimensionsFit)score+=5;
 if(!box.financing.length)missing.push('Financing suitability');
 if(conflicts.some(item=>item.includes('excluded area')))score=0;
 return {investorId:investor.id,investorName:investor.name,propertyId:property.id,buyBoxId:box.id,buyBoxLabel:box.label,score,reasons,conflicts,missing,disclosureReady:isDisclosureReady(disclosure),engagementScore:engagement(investor,data)};
}
export function matchProperty(actor:Actor,propertyId:string):BuyerMatch[] {requireFeature(actor,'buyer-matchmaker');return compareProperty(actor,propertyId);}
/** Shared computation for already-authorized workflows; not a public endpoint or model tool. */
export function compareProperty(actor:Actor,propertyId:string):BuyerMatch[] {
 const context=propertyContext(actor,propertyId);
 return readInvestors(actor).map(investor=>{
 const data=initialize(actor,investor.id);const disclosure=getDisclosure(actor,investor.id);
 const matches=listBuyBoxes(actor,investor.id).filter(box=>box.active&&box.provenance.reviewStatus==='approved').map(box=>scoreBox(investor,box,context,data,disclosure)).sort((a,b)=>Number(a.conflicts.length>0)-Number(b.conflicts.length>0)||b.score-a.score||a.missing.length-b.missing.length);
 return matches[0]??{investorId:investor.id,investorName:investor.name,propertyId,buyBoxId:null,buyBoxLabel:'No active buy box',score:0,reasons:[],conflicts:[],missing:['Active buying criteria'],disclosureReady:false,engagementScore:engagement(investor,data)};
 }).sort((a,b)=>b.score-a.score||a.investorId.localeCompare(b.investorId));
}
export function getCallingQueue(actor:Actor,options:{propertyId?:string;includeDismissed?:boolean}={}):CallPriority[] {
 assertActor(actor);
 const releases=authorizedReleases(actor).filter(release=>release.status==='released');
 const propertyIds=options.propertyId?[options.propertyId]:releases.map(release=>release.propertyId);
 requireFeature(actor,'daily-coordinator');const allMatches=hasFeature(actor,'buyer-matchmaker')?propertyIds.flatMap(id=>compareProperty(actor,id)):[];
 const tasks=scopedRows<Task>(actor,'tasks',true).filter(task=>task.status==='open');
 const queue=readInvestors(actor).filter(investor=>investor.ownerId===actor.id).map(investor=>{
 const data=initialize(actor,investor.id),disclosure=getDisclosure(actor,investor.id);
 const row=getDb().prepare('SELECT data FROM call_priorities WHERE organization_id=? AND office_id=? AND owner_id=? AND investor_id=?').get(actor.organizationId,actor.officeId,actor.id,investor.id) as {data:string}|undefined;
 const priority:{dismissed:boolean;manualPriority:number}=row?JSON.parse(row.data):{dismissed:false,manualPriority:0};
 const match=allMatches.filter(item=>item.investorId===investor.id).sort((a,b)=>b.score-a.score)[0]??null;
 const property=match?propertyContext(actor,match.propertyId).property:null;
 const reasons:string[]=[];const overdue=tasks.filter(task=>task.investorId===investor.id&&task.dueAt&&Date.parse(task.dueAt)<=Date.now());
 let score=priority.manualPriority;
 if(match){score+=Math.round(match.score*.5);reasons.push(`${match.score}/100 property fit for ${property!.address} (${match.buyBoxLabel}).`);}
 if(overdue.length){score+=35;reasons.push(`${overdue.length} due or overdue commitment${overdue.length===1?'':'s'}.`);}
 const dormant=!investor.lastContactAt||Date.now()-Date.parse(investor.lastContactAt)>14*86400000;
 if(dormant){score+=15;reasons.push(investor.lastContactAt?'No recorded contact in more than 14 days.':'No previous contact is recorded.');}
 const engagementScore=engagement(investor,data);score+=Math.round(engagementScore*.15);
 if(isDisclosureReady(disclosure)){score+=5;reasons.push('Current synthetic disclosure fixture is ready.');}else reasons.push('Confirm disclosure before sharing restricted property details.');
 if(data.currentActivity==='paused'){score-=30;reasons.push('Investor reported a buying pause.');}
 if(priority.manualPriority)reasons.push(`Employee priority adjustment: ${priority.manualPriority>0?'+':''}${priority.manualPriority}.`);
 if(!investor.phone)reasons.push('Verified phone number is missing.');
 return {investor,rank:0,score,engagementScore,reasons,property,match,disclosure,talkingPoints:[...overdue.map(task=>task.title),...(match?.reasons.slice(0,2)??[]),...(!investor.timeframe?['Confirm current purchase timing.']:[])],lastOutcome:data.lastOutcome,...priority};
 }).filter(item=>options.includeDismissed||!item.dismissed).sort((a,b)=>b.score-a.score||a.investor.id.localeCompare(b.investor.id));
 return queue.map((item,index)=>({...item,rank:index+1}));
}
export function setCallPriority(actor:Actor,investorId:string,input:{dismissed?:boolean;manualPriority?:number}) {
 requireFeature(actor,'daily-coordinator');
 const investor=writableInvestor(actor,investorId);if(investor.ownerId!==actor.id)throw new AppError(403,'Calling priorities belong to the relationship owner.');
 const parsed=z.object({dismissed:z.boolean().optional(),manualPriority:z.number().int().min(-100).max(100).optional()}).strict().parse(input);
 const previous=getDb().prepare('SELECT data FROM call_priorities WHERE organization_id=? AND office_id=? AND owner_id=? AND investor_id=?').get(actor.organizationId,actor.officeId,actor.id,investorId) as {data:string}|undefined;
 const value={dismissed:false,manualPriority:0,...(previous?JSON.parse(previous.data):{}),...parsed};
 getDb().prepare('INSERT INTO call_priorities VALUES(?,?,?,?,?) ON CONFLICT(organization_id,office_id,owner_id,investor_id) DO UPDATE SET data=excluded.data').run(actor.organizationId,actor.officeId,actor.id,investorId,JSON.stringify(value));audit(actor,'calling_priority.updated',investorId);return value;
}
export function getCallBriefing(actor:Actor,investorId:string,propertyId?:string):CallBriefing {
 requireFeature(actor,'investor-relationship');const data=getInvestorIntelligence(actor,investorId);
 const commitments=scopedRows<Task>(actor,'tasks',true).filter(task=>task.status==='open'&&task.investorId===investorId);
 const ids=propertyId?[propertyId]:authorizedReleases(actor).filter(item=>item.status==='released').map(item=>item.propertyId);
 const matches=ids.flatMap(id=>compareProperty(actor,id)).filter(match=>match.investorId===investorId).sort((a,b)=>b.score-a.score);
 const missing=[...(!data.investor.financing?['Confirmed funding']:[]),...(!data.investor.timeframe?['Current purchase timing']:[]),...(!data.investor.phone?['Verified phone number']:[]),...(!data.buyBoxes.some(box=>box.active)?['Active buy box']:[])];
 return {investor:data.investor,buyBoxes:data.buyBoxes,disclosure:data.disclosure,lastConversation:data.history.find(event=>event.kind==='debrief'||event.kind==='call'&&!/^(no answer|left message)/.test(event.summary))?.summary??(data.investor.notes.trim()?`Stored CRM notes (legacy; call date unverified): ${data.investor.notes}`:null),lastOutcome:data.lastOutcome,commitments,matches,objective:commitments[0]?`Resolve the outstanding commitment: ${commitments[0].title}`:matches[0]?.score?'Confirm current buying intent and review the strongest authorized property match.':'Confirm current buying criteria and the next follow-up.',missing,source:'Permitted local demo CRM, reviewed criteria, and employee-entered relationship history; no external call recording.'};
}
export const callOutcomeSchema=z.object({outcome:z.enum(['connected','no_answer','left_message','interested','not_interested','paused']),notes:z.string().trim().max(5000).optional(),followUpAt:z.string().datetime({offset:true}).nullable().optional()}).strict();
export function recordCallOutcome(actor:Actor,investorId:string,input:unknown) {
 requireFeature(actor,'salesforce-assistant');
 const investor=writableInvestor(actor,investorId);const parsed=callOutcomeSchema.parse(input);
 return getDb().transaction(()=>{
 const data=initialize(actor,investorId);const connected=['connected','interested','not_interested','paused'].includes(parsed.outcome);
 if(connected)updateRecord(actor,'investors',{...investor,lastContactAt:now()});
 saveIntelligence(actor,investorId,{...data,lastOutcome:parsed.outcome,...(parsed.outcome==='paused'?{currentActivity:'paused' as const,activitySource:'Employee-confirmed call outcome'}:{})});
 const event=addRelationshipEvent(actor,investorId,'call',`${parsed.outcome.replaceAll('_',' ')}${parsed.notes?`: ${parsed.notes}`:''}`,'Employee-entered personal-phone call outcome');
 let task:Task|null=null;
 if(parsed.followUpAt){task={id:newId('task'),title:`Follow up with ${investor.name}`,investorId,status:'open',dueAt:new Date(parsed.followUpAt).toISOString(),createdAt:now(),ownerId:actor.id};getDb().prepare('INSERT INTO tasks(id,organization_id,office_id,owner_id,investor_id,data) VALUES(?,?,?,?,?,?)').run(task.id,actor.organizationId,actor.officeId,actor.id,investorId,JSON.stringify(task));}
 audit(actor,'call.outcome.recorded',investorId,{outcome:parsed.outcome,followUp:!!task});return {event,task};
 })();
}
