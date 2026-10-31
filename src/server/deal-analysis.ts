import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {AnalysisInput,AnalysisSubject,AnalysisLens,AnalysisBoard,AnalysisDetail,AnalysisPreview,SavedAnalysis} from '../lib/analysis-contracts';
import {AppError,assertActor,audit,getDb,newId,now,requireRole} from './db';
import {billingPolicy,featureAccess,requireFeature} from './billing';
import {readInvestor,readProperty,readProperties} from './access';
import {getOpportunity,getOpportunityBoard} from './opportunities';
import {listReleases} from './workflows';
import {analysisPreviewSchema,analysisSaveSchema} from './analysis-schema';
import {analysisMethod,calculateAnalysis} from './analysis-calculator';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const feature=(lens:AnalysisLens)=>lens==='investment'?'deal-analyst':'valuation-diligence';
function readable(actor:Actor,lens:AnalysisLens){requireRole(actor,lens==='investment'?['dispositions','manager']:['acquisitions','manager']);if(billingPolicy(actor).restricted.includes(feature(lens)))throw new AppError(403,'This analysis is restricted by organization policy.');}
function authorize(actor:Actor,lens:AnalysisLens){readable(actor,lens);requireFeature(actor,'core');requireFeature(actor,feature(lens));}
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id,actor.role];
function subjectFor(actor:Actor,input:Pick<AnalysisInput,'sourceKind'|'sourceId'|'investorId'>):AnalysisSubject {
 assertActor(actor);const investor=input.investorId?readInvestor(actor,input.investorId):null;
 if(input.sourceKind==='opportunity'){
  const detail=getOpportunity(actor,input.sourceId),item=detail.opportunity;
  return {id:item.id,kind:'opportunity',address:`${item.address}, ${item.city}, ${item.state}`,propertyType:item.propertyType,sqft:null,askingPrice:item.submission.askingPrice,status:item.status,sourceReference:`${item.submission.sourceReference} · opportunity version ${item.version} · unverified`,sourceFingerprint:hash({scope:scope(actor),reference:detail.opportunityAccessReference,investor})};
 }
 const property=readProperty(actor,input.sourceId),release=listReleases(actor).find(item=>item.propertyId===property.id)??null;
 return {id:property.id,kind:'property',address:`${property.address}, ${property.city}`,propertyType:release?.propertyType??'',sqft:property.sqft,askingPrice:property.price,status:release?.status??property.status,sourceReference:release?`${release.source} · release version ${release.version} · fictional`:'Fictional inventory record; property type/economic evidence may be incomplete',sourceFingerprint:hash({scope:scope(actor),property,release:release?{id:release.id,version:release.version,status:release.status,propertyType:release.propertyType,arv:release.arv,repairEstimate:release.repairEstimate,economicsSource:release.economicsSource}:null,investor})};
}
function stored(actor:Actor,id:string):SavedAnalysis {
 assertActor(actor);const row=getDb().prepare('SELECT data FROM deal_analyses WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Analysis not found in your private workspace.');const value=JSON.parse(row.data) as SavedAnalysis;readable(actor,value.input.lens);subjectFor(actor,value.input);return value;
}
function availableLenses(actor:Actor):AnalysisLens[]{assertActor(actor);return (actor.role==='manager'?['investment','diligence']:actor.role==='acquisitions'?['diligence']:['investment']).filter(lens=>!billingPolicy(actor).restricted.includes(feature(lens as AnalysisLens))) as AnalysisLens[];}
function visibleRecords(actor:Actor):SavedAnalysis[]{assertActor(actor);const rows=getDb().prepare('SELECT id FROM deal_analyses WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY rowid DESC').all(actor.organizationId,actor.officeId,actor.id) as {id:string}[];return rows.flatMap(row=>{try{return [stored(actor,row.id)];}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return [];throw error;}});}
export function getAnalysisBoard(actor:Actor):AnalysisBoard {
 const lenses=availableLenses(actor),records=visibleRecords(actor),subjects:AnalysisSubject[]=readProperties(actor).map(item=>subjectFor(actor,{sourceKind:'property',sourceId:item.id,investorId:null}));
 if(actor.role!=='dispositions'&&!billingPolicy(actor).restricted.includes('acquisition-lead'))for(const item of getOpportunityBoard(actor).items)subjects.push(subjectFor(actor,{sourceKind:'opportunity',sourceId:item.id,investorId:null}));
 const items=records.map(item=>({id:item.id,label:item.input.label,version:item.version,strategy:item.input.strategy,lens:item.input.lens,address:item.subject.address}));
 return {items,subjects,lenses,canCreate:featureAccess(actor,'core').allowed&&lenses.some(lens=>featureAccess(actor,feature(lens)).allowed),analysisAccessReference:`board@${hash({scope:scope(actor),method:analysisMethod,items,subjects,day:now().slice(0,10)})}`};
}
export function getAnalysis(actor:Actor,id:string):AnalysisDetail {
 const value=stored(actor,id),current=subjectFor(actor,value.input),sourceChanged=current.sourceFingerprint!==value.subject.sourceFingerprint||value.result.method!==analysisMethod;
 const history=(getDb().prepare('SELECT data FROM deal_analysis_events WHERE organization_id=? AND office_id=? AND analysis_id=? ORDER BY rowid DESC LIMIT 20').all(actor.organizationId,actor.officeId,id) as {data:string}[]).map(row=>JSON.parse(row.data) as SavedAnalysis);
 const {result,...record}=value;
 // A new day can change evidence-age warnings, so a saved calculation is explicitly dated.
 return {record,result:sourceChanged?null:result,sourceChanged,canEdit:featureAccess(actor,'core').allowed&&featureAccess(actor,feature(value.input.lens)).allowed,history:history.map(item=>({version:item.version,recordedAt:item.updatedAt,label:item.input.label,input:item.input})),analysisAccessReference:`${id}@${hash({scope:scope(actor),record,sourceChanged,current,method:analysisMethod,day:now().slice(0,10)})}`};
}
export function analysisReferenceCurrent(actor:Actor,reference:string):boolean {try{const id=reference.split('@')[0];const current=id==='board'?getAnalysisBoard(actor):getAnalysis(actor,id);return current.analysisAccessReference===reference&&(!('sourceChanged' in current)||!current.sourceChanged);}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}}
export function analysisContextReference(actor:Actor){return getAnalysisBoard(actor).analysisAccessReference;}
export function reviewAnalysisBoard(actor:Actor){requireFeature(actor,'core');const board=getAnalysisBoard(actor);if(!board.lenses.some(lens=>featureAccess(actor,feature(lens)).allowed))throw new AppError(403,'No analysis specialist is available for this employee.');return board;}
export function analysisMessage(detail:AnalysisDetail):string {if(!detail.result)return 'The linked source changed. Review a fresh scenario in Work → Deal analysis.';const result=detail.result;return `${detail.record.input.label} · version ${detail.record.version} · ${result.asOf}\n${result.summary}\n${result.metrics.map(item=>`${item.label}: ${item.value===null?'Not calculable':item.value.toLocaleString('en-US')} ${item.unit}`).join('\n')}\n${result.questions.join('\n')}\n${result.warnings.join('\n')}\n${result.notice}`;}
export function previewAnalysis(actor:Actor,raw:z.input<typeof analysisPreviewSchema>):AnalysisPreview {
 const input=analysisPreviewSchema.parse(raw);authorize(actor,input.input.lens);
 const previous=input.id?stored(actor,input.id):null;if((previous?.version??0)!==input.expectedVersion)throw new AppError(409,'This analysis changed. Reload the current version before reviewing.');
 if(previous&&(['sourceKind','sourceId','investorId','lens'] as const).some(key=>previous.input[key]!==input.input[key]))throw new AppError(409,'A revision must keep the same subject, investor and specialist. Create a separate analysis for a different context.');
 const subject=subjectFor(actor,input.input),result=calculateAnalysis(input.input,subject,now().slice(0,10));
 return {...input,subject,result,reviewReference:hash({scope:scope(actor),input,subject,result})};
}
export function saveAnalysis(actor:Actor,raw:z.input<typeof analysisSaveSchema>):AnalysisDetail {
 const input=analysisSaveSchema.parse(raw);authorize(actor,input.input.lens);
 return getDb().transaction(()=>{
  const payloadHash=hash(input),prior=getDb().prepare('SELECT payload_hash,analysis_id FROM deal_analysis_events WHERE organization_id=? AND office_id=? AND actor_id=? AND event_key=?').get(actor.organizationId,actor.officeId,actor.id,input.eventKey) as {payload_hash:string;analysis_id:string}|undefined;
  if(prior){if(prior.payload_hash!==payloadHash)throw new AppError(409,'This request belongs to a different analysis revision.');return getAnalysis(actor,prior.analysis_id);}
  const preview=previewAnalysis(actor,{id:input.id,expectedVersion:input.expectedVersion,input:input.input});if(preview.reviewReference!==input.reviewReference)throw new AppError(409,'The evidence or reviewed assumptions changed. Review again before saving.');
  const previous=input.id?stored(actor,input.id):null,stamp=now(),value:SavedAnalysis={id:previous?.id??newId('analysis'),ownerId:actor.id,version:(previous?.version??0)+1,createdAt:previous?.createdAt??stamp,updatedAt:stamp,input:input.input,subject:preview.subject,result:preview.result,synthetic:true};
  if(previous)getDb().prepare('UPDATE deal_analyses SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(value),value.id,actor.organizationId,actor.officeId,actor.id);
  else getDb().prepare('INSERT INTO deal_analyses VALUES(?,?,?,?,?)').run(value.id,actor.organizationId,actor.officeId,actor.id,JSON.stringify(value));
  getDb().prepare('INSERT INTO deal_analysis_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('analysis_event'),actor.organizationId,actor.officeId,actor.id,input.eventKey,payloadHash,value.id,JSON.stringify(value),stamp);audit(actor,'analysis.revision.saved',value.id);return getAnalysis(actor,value.id);
 }).immediate();
}
export function reviewSavedAnalysis(actor:Actor,id:string){const detail=getAnalysis(actor,id);authorize(actor,detail.record.input.lens);if(detail.sourceChanged)throw new AppError(409,'The linked source changed. Review and save a fresh analysis before using these results.');return detail;}
