import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {PropertyRelease,ReleaseInput} from '../lib/intelligence-contracts';
import type {AcquisitionReview,AcquisitionSubmission} from '../lib/acquisition-contracts';
import {AppError,getDb,requireRole} from './db';
import {featureAccess,requireFeature} from './billing';
import {readProperty} from './access';
import {getRelease,listReleases,saveRelease} from './workflows';
import {acquisitionSubmissionSchema} from './acquisition-schema';

export const acquisitionMethod={id:'acquisition-intake' as const,version:1 as const,source:'AgentDesk provisional acquisition method · 2026-10-30.1',authority:'provisional' as const,steps:['Keep supplied statements separate from current inventory facts.','Ask for decision-changing missing sources, dates and assumptions before screening.','Compare revisions and prepare an internal handoff; never infer value, title clearance or permission to market.']};
export const acquisitionInputSchema=z.object({expectedVersion:z.number().int().nonnegative(),eventKey:z.string().min(1).max(100),submission:acquisitionSubmissionSchema}).strict();
const display=(value:unknown)=>value===null||value===undefined||value===''?'Not supplied':String(value);
function readable(actor:Actor,propertyId:string){requireRole(actor,['acquisitions','manager']);const property=readProperty(actor,propertyId),release=listReleases(actor).find(item=>item.propertyId===propertyId)??null;return {property,release};}
export function reviewAcquisition(actor:Actor,propertyId:string):AcquisitionReview {
 const {property,release}=readable(actor,propertyId),submission=release?.acquisitionSubmission??null;
 const history=release?(getDb().prepare('SELECT data FROM release_events WHERE organization_id=? AND office_id=? AND release_id=? ORDER BY version DESC').all(actor.organizationId,actor.officeId,release.id) as {data:string}[]).map(row=>JSON.parse(row.data) as PropertyRelease).slice(0,20):[];
 const previous=history.find(item=>item.version<(release?.version??0)&&item.acquisitionSubmission)?.acquisitionSubmission??null;
 const questions:AcquisitionReview['questions']=[],facts:AcquisitionReview['facts']=[],changes:AcquisitionReview['changes']=[];
 const ask=(field:string,question:string,reason:string)=>questions.push({field,question,reason});
 if(!submission)ask('submission','Who supplied this opportunity, on what date, and where is the original submission?','No structured wholesaler submission has been recorded.');
 else {
  for(const [label,value] of [['Wholesaler',submission.wholesaler],['Source date',submission.reportedOn],['Supplied asking price',submission.askingPrice],['Supplied repair estimate',submission.repairEstimate],['Repair scope',submission.repairScope],['Repair evidence',submission.repairSource],['Occupancy',submission.occupancy],['Comparable references',submission.comparableSources]] as const)if(value!==null&&value!==''&&value!=='unknown')facts.push({label,value:display(value),source:`${submission.sourceReference} · employee-recorded, unverified`});
  if(!submission.reportedOn)ask('reportedOn','When did the wholesaler supply these terms, and are they still current?','The original source date is unknown.');
  if(submission.askingPrice===null)ask('askingPrice','What is the current asking price, and what terms or fees does it include?','A supplied asking price is missing.');
  else if(submission.askingPrice!==property.price)ask('askingPrice','Which asking price is current, and who will reconcile it with the inventory record before handoff?','The submission differs from the current inventory asking price.');
  if(submission.repairEstimate===null||!submission.repairScope||!submission.repairSource)ask('repairs','Can the wholesaler provide the repair scope, estimate source/date and supporting review material?','A number without scope and evidence is an unsupported assumption.');
  if(submission.occupancy==='unknown')ask('occupancy','Is the property occupied or vacant, and what access arrangements are confirmed?','Occupancy and practical access are not established.');
  if(!submission.comparableSources)ask('comparables','Which comparable sales support the supplied expectations, and what are their sources and dates?','No comparable references were supplied; no valuation can be inferred.');
  if(previous)for(const key of Object.keys(submission) as (keyof AcquisitionSubmission)[])if(submission[key]!==previous[key])changes.push({field:key,before:display(previous[key]),after:display(submission[key])});
 }
 if(!release?.closingAt)ask('closing','What closing target was actually agreed, and by whom?','No closing date is recorded.');
 if(!release?.showingInstructions)ask('access','Who can confirm inspection or showing access and any restrictions?','Showing instructions are not recorded.');
 const status=release?.status??'none',withdrawn=status==='withdrawn';
 const summary=withdrawn?'This opportunity release is withdrawn. Review the current source before further handoff.':`${facts.length} supplied facts; ${questions.length} items to clarify.${changes.length?' The submission changed; previous handoff assumptions need review.':''}`;
 const handoffDraft=[`INTERNAL FICTIONAL HANDOFF — ${property.address}`,`Release version: ${release?.version??0} · ${status}`,summary,`Inventory asking price: $${property.price.toLocaleString()}`, ...facts.map(f=>`${f.label}: ${f.value} [${f.source}]`),...changes.map(c=>`CHANGED ${c.field}: ${c.before} → ${c.after}`),...questions.map(q=>`Confirm: ${q.question}`),'Supplied figures and references are unverified. This is not valuation. No title clearance, reservation, release approval or external delivery is established.'].join('\n');
 let owner=true;if(release){const row=getDb().prepare('SELECT owner_id FROM property_releases WHERE id=? AND organization_id=? AND office_id=?').get(release.id,actor.organizationId,actor.officeId) as {owner_id:string};owner=actor.role==='manager'||row.owner_id===actor.id;}
 return {property,releaseId:release?.id??null,version:release?.version??0,status,submission,recordedAt:release?.updatedAt??null,facts,questions,changes,history:history.map(item=>({version:item.version,status:item.status,recordedAt:item.updatedAt,submission:item.acquisitionSubmission??null})),method:structuredClone(acquisitionMethod),summary,handoffDraft,canEdit:owner&&featureAccess(actor,'acquisition-disposition').allowed,notice:'Provisional AgentDesk intake guidance, not an approved New Western procedure. References are recorded, not fetched or verified. Saving creates a new draft revision and invalidates earlier deal packages; inventory facts remain unchanged.'};
}
/** Explicit employee recording only. Model tools may read the review, never submit testimony. */
export function recordAcquisitionSubmission(actor:Actor,propertyId:string,raw:z.input<typeof acquisitionInputSchema>):AcquisitionReview {
 requireRole(actor,['acquisitions','manager']);requireFeature(actor,'core');requireFeature(actor,'acquisition-disposition');const input=acquisitionInputSchema.parse(raw);
 return getDb().transaction(()=>{
  const {property,release}=readable(actor,propertyId);
  // Recover an exact saved event before rebuilding defaults from newer data.
  const key=`intake:${actor.id}:${input.eventKey}`;
  const prior=getDb().prepare('SELECT release_id,data FROM release_events WHERE organization_id=? AND office_id=? AND event_key=?').get(actor.organizationId,actor.officeId,key) as {release_id:string;data:string}|undefined;
  if(prior){getRelease(actor,prior.release_id);const saved=JSON.parse(prior.data) as PropertyRelease;if(saved.propertyId!==propertyId||saved.version!==input.expectedVersion+1||JSON.stringify(saved.acquisitionSubmission)!==JSON.stringify(input.submission))throw new AppError(409,'This intake request already belongs to a different submission.');return reviewAcquisition(actor,propertyId);}
  if((release?.version??0)!==input.expectedVersion)throw new AppError(409,'This opportunity changed. Review the latest version before recording a submission.');
  const fields:ReleaseInput={propertyId,status:'draft',source:input.submission.sourceReference,eventKey:key,expectedVersion:release?.version,propertyType:release?.propertyType??'',description:release?.description??'',notes:release?.notes??'',mediaUrl:release?.mediaUrl??null,mediaAccess:release?.mediaAccess??'unverified',permittedMediaInvestorIds:release?.permittedMediaInvestorIds??[],arv:release?.arv??null,repairEstimate:release?.repairEstimate??null,economicsSource:release?.economicsSource??'',showingInstructions:release?.showingInstructions??'',authorizedUserIds:release?.authorizedUserIds??[],upstreamParty:release?.upstreamParty??'',upstreamStage:release?.upstreamStage??'',downstreamStage:release?.downstreamStage??'',closingStructure:release?.closingStructure??'unspecified',closingAt:release?.closingAt??null,acquisitionSubmission:input.submission};
  saveRelease(actor,fields);return reviewAcquisition(actor,property.id);
 }).immediate();
}
