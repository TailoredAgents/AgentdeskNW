import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {BuyBox,InvestorIntelligence} from '../lib/intelligence-contracts';
import {relationshipTopics,type RelationshipTopic,type RelationshipValue,type RelationshipReportInput,type RelationshipReport,type RelationshipRecord,type RelationshipFact,type RelationshipFactSource} from '../lib/relationship-record-contracts';
import {readInvestorRow,writableInvestor} from './access';
import {requireFeature} from './billing';
import {AppError,audit,getDb,newId,now,requireRole} from './db';
import {getInvestorIntelligence} from './intelligence';

const id=z.string().trim().min(1).max(150);
const values=z.array(z.string().trim().min(1).max(180)).min(1).max(12).transform(items=>[...new Set(items)]);
const budget=z.object({min:z.number().min(0).max(100_000_000).nullable(),max:z.number().min(0).max(100_000_000).nullable()}).strict().refine(v=>(v.min!==null||v.max!==null)&&(v.min===null||v.max===null||v.min<=v.max),'Supply a valid budget range.');
export const relationshipReportSchema=z.object({
 investorId:id,buyBoxId:id.nullable(),topic:z.enum(['budget','geography','strategy','financing','rehab','timing','contact']),
 value:z.union([budget,values]),statement:z.string().trim().min(8).max(2000),
 statedAt:z.string().datetime({offset:true}).nullable(),supersedesId:id.nullable(),
 expectedVersion:z.number().int().nonnegative(),expectedContext:z.string().regex(/^[a-f0-9]{64}$/),eventKey:id,
}).strict().superRefine((v,ctx)=>{
 if((v.topic==='budget')===Array.isArray(v.value))ctx.addIssue({code:'custom',message:'Budget requires a range; other fields require a list of reported values.',path:['value']});
 if(['timing','contact'].includes(v.topic)?v.buyBoxId!==null:!v.buyBoxId)ctx.addIssue({code:'custom',message:'Choose a buy box for buying criteria; timing and contact preference apply to the relationship.',path:['buyBoxId']});
 if(v.statedAt&&Date.parse(v.statedAt)>Date.now())ctx.addIssue({code:'custom',message:'The statement date cannot be in the future. Put future purchase timing in the reported value.',path:['statedAt']});
});
const intervals:Record<RelationshipTopic,number>={budget:90,geography:90,strategy:90,financing:30,rehab:90,timing:30,contact:180};
export function displayRelationshipValue(value:RelationshipValue):string {
 if(Array.isArray(value))return value.join(' · ');
 const money=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
 return value.min!==null&&value.max!==null?money(value.min)+'–'+money(value.max):value.max!==null?'Up to '+money(value.max):value.min!==null?'From '+money(value.min):'Not recorded';
}
function normalized(value:RelationshipValue):string {
 return JSON.stringify(Array.isArray(value)?[...new Set(value.map(v=>v.trim().toLocaleLowerCase().replace(/\s+/g,' ')))].sort():value);
}
function reportRows(actor:Actor,investorId:string,officeId:string):RelationshipReport[] {
 const rows=getDb().prepare('SELECT data FROM relationship_reports WHERE organization_id=? AND office_id=? AND investor_id=? ORDER BY rowid').all(actor.organizationId,officeId,investorId) as {data:string}[];
 const reports=rows.map(row=>JSON.parse(row.data) as RelationshipReport);
 const corrections=new Map(reports.filter(v=>v.supersedesId).map(v=>[v.supersedesId,v.id]));
 return reports.map(report=>({...report,status:corrections.has(report.id)?'superseded':'active',supersededById:corrections.get(report.id)??null}));
}
function freshness(date:string|null,days:number):RelationshipFactSource['freshness'] {
 if(!date||!Number.isFinite(Date.parse(date)))return 'undated';
 return Date.now()-Date.parse(date)>days*86400000?'review_due':'recent';
}
function canonicalValue(topic:RelationshipTopic,box:BuyBox|null,intelligence:InvestorIntelligence):RelationshipValue|null {
 if(topic==='budget')return box&&(box.priceMin!==null||box.priceMax!==null)?{min:box.priceMin,max:box.priceMax}:null;
 const list=topic==='geography'?box&&[...box.states.map(v=>'State: '+v),...box.counties.map(v=>'County: '+v),...box.cities.map(v=>'City: '+v),...box.zipCodes.map(v=>'ZIP: '+v)]:
 topic==='strategy'?box?.strategies:topic==='financing'?box?.financing:topic==='rehab'?box?.rehabLevels:
 topic==='timing'?intelligence.investor.timeframe?[intelligence.investor.timeframe]:[]:
 intelligence.communicationPreference?[intelligence.communicationPreference]:[];
 return list?.length?list:null;
}
/** Shared investor testimony only. Private mailboxes and employee memory are never read here. */
export function getRelationshipRecord(actor:Actor,investorId:string,intelligence?:InvestorIntelligence):RelationshipRecord {
 requireFeature(actor,'core');
 const investor=readInvestorRow(actor,id.parse(investorId));
 const current=intelligence??getInvestorIntelligence(actor,investorId);
 const reports=reportRows(actor,investorId,investor.office_id);
 const approved=current.buyBoxes.filter(box=>box.provenance.reviewStatus==='approved');
 const scopes:Array<{box:BuyBox|null;topics:RelationshipTopic[]}>=approved.filter(box=>box.active||reports.some(report=>report.buyBoxId===box.id)).map(box=>({box,topics:['budget','geography','strategy','financing','rehab']}));
 scopes.push({box:null,topics:['timing','contact']});
 // A referenced historical scope stays distinct even if its buy box is retired.
 for(const report of reports)if(report.buyBoxId&&!scopes.some(scope=>scope.box?.id===report.buyBoxId)){
  scopes.push({box:{id:report.buyBoxId,label:'Historical buy box',active:false} as BuyBox,topics:['budget','geography','strategy','financing','rehab']});
 }
 const facts:RelationshipFact[]=scopes.flatMap(({box,topics})=>topics.map(topic=>{
  const actualBox=box?approved.find(value=>value.id===box.id)??null:null;
  const value=box&&!actualBox?null:canonicalValue(topic,actualBox,current),days=intervals[topic];
  const fields=topic==='budget'?['priceMin','priceMax']:topic==='geography'?['states','counties','cities','zipCodes']:[topic==='strategy'?'strategies':topic==='financing'?'financing':'rehabLevels'];
  // A newer edit to one bound/location must not refresh the entire compound value.
  const provenance=actualBox?fields.filter(field=>{const v=actualBox[field as keyof BuyBox];return Array.isArray(v)?v.length>0:v!==null;}).map(field=>({field,source:actualBox.fieldProvenance?.[field]??actualBox.provenance})):[];
  const capturedAt=provenance.length&&provenance.every(item=>item.source.capturedAt)?provenance.map(item=>item.source.capturedAt).sort()[0]:null;
  const recorded:RelationshipFactSource|null=value?{
   id:actualBox?'buy_box:'+actualBox.id+':'+topic+':'+actualBox.version:'crm:'+investorId+':'+topic,
   label:actualBox?actualBox.label+' · recorded criteria':'Current relationship record',
   value,displayValue:displayRelationshipValue(value),statement:provenance.length?provenance.map(item=>item.field+': '+item.source.statement).join('\n'):current.relationshipSource,
   recordedAt:capturedAt,statedAt:null,
   verification:provenance.some(item=>item.source.verification==='seeded_demo')||!actualBox&&current.investor.synthetic?'seeded_demo':'reviewed_record',
   freshness:freshness(capturedAt,days),sourceKind:'recorded_criteria',
  }:null;
  const active=reports.filter(report=>report.status==='active'&&report.topic===topic&&report.buyBoxId===(box?.id??null));
  const sources:RelationshipFactSource[]=active.map(report=>({
   id:report.id,label:'Employee-reported update',value:report.value,displayValue:displayRelationshipValue(report.value),
   statement:report.statement,recordedAt:report.recordedAt,statedAt:report.statedAt,verification:'employee_reported',
   freshness:freshness(report.statedAt,days),sourceKind:'employee_report',
  }));
  const distinct=new Set([...(recorded?[normalized(recorded.value)]:[]),...sources.map(source=>normalized(source.value))]);
  const status=distinct.size>1?'needs_clarification':sources.length?'reported':recorded?'recorded':'unknown';
  return {key:(box?.id??'relationship')+':'+topic,topic,label:relationshipTopics[topic],buyBoxId:box?.id??null,
   scopeLabel:box?box.label+(box.active?'':' · inactive'):'Whole relationship',
   recorded,reports:sources,status,question:status==='needs_clarification'?'Which '+relationshipTopics[topic].toLowerCase()+' should guide this '+(box?'buy box':'relationship')+'? Review the differing sources before updating recorded criteria.':null,
   reconfirmAfterDays:days};
 }));
 let canEdit=false;
 if(['dispositions','manager'].includes(actor.role)){try{writableInvestor(actor,investorId);canEdit=true;}catch(error){if(!(error instanceof AppError))throw error;}}
 return {investorId,version:reports.length,contextVersion:createHash('sha256').update(JSON.stringify({investor:current.investor,buyBoxes:current.buyBoxes,contact:current.communicationPreference,activity:current.currentActivity,reports:reports.map(r=>r.id)})).digest('hex'),generatedAt:now(),facts,reports,
  conflicts:facts.filter(f=>f.status==='needs_clarification'),
  reviewDue:facts.filter(f=>[...(f.recorded?[f.recorded]:[]),...f.reports].some(s=>s.freshness==='review_due')),
  undated:facts.filter(f=>[...(f.recorded?[f.recorded]:[]),...f.reports].some(s=>s.freshness==='undated')),
  canEdit,notice:'Recorded criteria and employee reports are separate. Differences need clarification; newer reports do not automatically change CRM facts. Reconfirmation intervals are provisional application defaults.',
  policy:{version:'relationship-record-v1',provisional:true}};
}
export function recordRelationshipReport(actor:Actor,input:RelationshipReportInput):RelationshipRecord {
 requireRole(actor,['dispositions','manager']);requireFeature(actor,'core');
 const parsed=relationshipReportSchema.parse(input);writableInvestor(actor,parsed.investorId);
 const payload={...parsed,statedAt:parsed.statedAt?new Date(parsed.statedAt).toISOString():null};
 const payloadHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return getDb().transaction(()=>{
  const current=getRelationshipRecord(actor,parsed.investorId);
  const previous=getDb().prepare('SELECT payload_hash FROM relationship_reports WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(actor.organizationId,actor.officeId,actor.id,parsed.eventKey) as {payload_hash:string}|undefined;
  if(previous){if(previous.payload_hash!==payloadHash)throw new AppError(409,'This report request was already used with different details.');return current;}
  if(current.version!==parsed.expectedVersion||current.contextVersion!==parsed.expectedContext)throw new AppError(409,'The investor record changed. Reload and review your report again.');
  if(parsed.buyBoxId&&!getInvestorIntelligence(actor,parsed.investorId).buyBoxes.some(box=>box.id===parsed.buyBoxId&&box.active&&box.provenance.reviewStatus==='approved'))throw new AppError(404,'Select an active, reviewed buy box belonging to this investor.');
  if(parsed.supersedesId){
   const earlier=current.reports.find(report=>report.id===parsed.supersedesId);
   if(!earlier)throw new AppError(404,'The earlier report was not found in this investor record.');
   if(earlier.status!=='active')throw new AppError(409,'That report already has a correction. Review its current replacement.');
   if(earlier.topic!==parsed.topic||earlier.buyBoxId!==parsed.buyBoxId)throw new AppError(422,'A correction must keep the same field and buy box as the original report.');
  }
  const {expectedVersion,expectedContext,eventKey,...fields}=payload;
  void expectedVersion;void expectedContext;
  const report:RelationshipReport={...fields,id:newId('relationship_report'),recordedAt:now(),recordedBy:actor.id,verification:'employee_reported',status:'active',supersededById:null};
  getDb().prepare('INSERT INTO relationship_reports VALUES(?,?,?,?,?,?,?,?,?,?)').run(report.id,actor.organizationId,actor.officeId,actor.id,report.investorId,report.buyBoxId,report.supersedesId,eventKey,payloadHash,JSON.stringify(report));
  audit(actor,'relationship.report.recorded',report.id,{investorId:report.investorId,topic:report.topic,supersedesId:report.supersedesId});
  return getRelationshipRecord(actor,parsed.investorId);
 }).immediate();
}
