import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {CommunicationAttachment} from '../lib/communications-contracts';
import {transactionPartyRoles,transactionMilestones,transactionMilestoneLabels,type TransactionInput,type TransactionRecord,type TransactionDetail,type TransactionBoard,type SaveTransaction,type TransactionPreparation} from '../lib/transaction-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {readProperty,readProperties,readInvestor,readInvestors} from './access';
import {featureAccess,requireFeature} from './billing';
import {communicationDocumentsSchema,communicationDocumentOptions,reviewCommunicationDocuments} from './communication-documents';
import {getDocument,readDocumentRevision} from './documents';
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=z.string().min(1).max(150),line=z.string().trim().min(1).max(240).refine(value=>!/[\r\n\u0000]/.test(value),'Use a single line.');
const party=z.object({name:line.max(120),email:z.email().max(254).transform(v=>v.toLowerCase()),source:line}).strict().nullable();
const report=z.object({date:z.iso.date(),source:line,note:z.string().trim().min(1).max(1500),document:communicationDocumentsSchema.element.nullable()}).strict().nullable();
export const transactionInputSchema=z.object({propertyId:id,investorId:id,closingDate:z.iso.date().nullable(),financing:z.enum(['unknown','cash','hard_money','other']),parties:z.object({buyer:party,attorney:party,acquisition:party,lender:party}).strict(),milestones:z.object({agreement:report,deposit:report,title_opened:report,title_cleared:report,signed:report,funded:report,closed:report}).strict(),issues:z.array(z.object({description:z.string().trim().min(1).max(800),source:line,dueDate:z.iso.date().nullable(),resolved:z.boolean()}).strict()).max(10)}).strict();
export const transactionSaveSchema=z.object({id:id.nullable(),expectedVersion:z.number().int().nonnegative(),input:transactionInputSchema,eventKey:id}).strict();
const notice='Private fictional transaction coordination. Milestones are employee reports, not independently verified events. Saving does not reserve a deal, stop marketing, open title, confirm money or change CRM.';
function context(actor:Actor,input:TransactionInput){return {property:readProperty(actor,input.propertyId),investor:readInvestor(actor,input.investorId),release:getDb().prepare('SELECT data FROM property_releases WHERE organization_id=? AND office_id=? AND property_id=?').get(actor.organizationId,actor.officeId,input.propertyId)??null};}
function stored(actor:Actor,transactionId:string){assertActor(actor);const row=getDb().prepare('SELECT data FROM transaction_coordination WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id.parse(transactionId),...scope(actor)) as {data:string}|undefined;if(!row)throw new AppError(404,'This transaction is not available in your private workspace.');const record=JSON.parse(row.data) as TransactionRecord;context(actor,record.input);return record;}
function validateDocuments(actor:Actor,input:TransactionInput,current:boolean){
 for(const key of transactionMilestones){const ref=input.milestones[key]?.document;if(!ref)continue;const doc=getDocument(actor,ref.documentId),revision=readDocumentRevision(actor,ref.documentId,ref.revision);
  if((doc.document.propertyId&&doc.document.propertyId!==input.propertyId)||(doc.document.investorId&&doc.document.investorId!==input.investorId))throw new AppError(422,'Supporting documents must refer to this property and investor, or have no linked record.');
  const required=key==='agreement'?'purchase_agreement':key==='deposit'?'deposit_record':key==='title_cleared'?'title_report':null;
  if(required&&revision.input.purpose!==required)throw new AppError(422,`Choose a ${required.replaceAll('_',' ')} source for this milestone.`);
  if(current)reviewCommunicationDocuments(actor,[ref]);
 }
}
function preparation(actor:Actor,record:TransactionRecord):TransactionPreparation {
 const input=record.input,sources=context(actor,input),gaps:string[]=[],cautions:string[]=[],files:CommunicationAttachment[]=[];
 for(const role of ['buyer','attorney','acquisition'] as const)if(!input.parties[role])gaps.push(`Add the ${role==='acquisition'?'acquisition agent':role} contact and its source.`);
 if(input.financing==='unknown')gaps.push('Confirm how the buyer plans to finance this purchase.');
 if(input.financing!=='cash'&&input.financing!=='unknown'&&!input.parties.lender)gaps.push('Add a lender contact for this financed purchase.');
 if(!input.closingDate)gaps.push('Record the proposed closing date.');else if(input.closingDate<now().slice(0,10))gaps.push('The closing target is in the past. Review the date before preparing title opening.');
 if(input.parties.lender&&input.financing==='cash')cautions.push('A lender contact is retained in your record but excluded from a cash-purchase recipient list.');
 const fingerprints:unknown[]=[];
 for(const key of transactionMilestones){const report=input.milestones[key];if(!report){if(key==='agreement'||key==='deposit')gaps.push(`Record the employee report for ${transactionMilestoneLabels[key].toLowerCase()}.`);continue;}
  if(!report.document){if(key==='agreement'||key==='deposit')gaps.push(`Select current supporting text for ${transactionMilestoneLabels[key].toLowerCase()}.`);continue;}
  try{const doc=getDocument(actor,report.document.documentId),version=readDocumentRevision(actor,report.document.documentId,report.document.revision);fingerprints.push({key,document:doc.document,reference:doc.reference});const current=doc.reference===report.document.reference&&doc.document.revision===report.document.revision;
   if(!current)gaps.push(`Review the changed or withdrawn source for ${transactionMilestoneLabels[key].toLowerCase()}.`);
   else if(key==='agreement'||key==='deposit')files.push({id:`${doc.document.id}:${version.revision}`,name:version.input.fileName,mimeType:'text/plain',sizeBytes:version.sizeBytes,availability:'local_text',document:report.document,sha256:version.sha256,current:true,textContent:version.input.content});
  }catch(error){if(error instanceof AppError&&[403,404].includes(error.status)){gaps.push(`A source for ${transactionMilestoneLabels[key].toLowerCase()} is unavailable.`);fingerprints.push({key,unavailable:true});}else throw error;}
 }
 if(input.issues.some(issue=>!issue.resolved))cautions.push(`${input.issues.filter(issue=>!issue.resolved).length} unresolved issue(s) remain. Opening title would not resolve them.`);
 const reports=transactionMilestones.filter(key=>input.milestones[key]);
 for(const key of reports){const index=transactionMilestones.indexOf(key);if(index>0&&!input.milestones[transactionMilestones[index-1]])cautions.push(`${transactionMilestoneLabels[key]} was reported without the preceding milestone. Confirm the missing history; no earlier event was inferred.`);}
 if(input.milestones.title_opened)gaps.push('Title opening is already reported. Review its acknowledgment and outstanding issues instead of preparing another opening.');
 const allParties=[input.parties.attorney,input.parties.buyer,input.parties.acquisition,...(input.financing==='cash'?[]:[input.parties.lender])].filter(p=>p!==null);
 if(new Set(allParties.map(p=>p.email)).size!==allParties.length)gaps.push('Review duplicate recipient addresses; each transaction contact must be explicit.');
 const reference=`${record.id}@${hash({scope:scope(actor),role:actor.role,record,sources,fingerprints,day:now().slice(0,10)})}`;
 if(!featureAccess(actor,'core').allowed)gaps.push('Current workforce access is required to prepare new title work.');
 const release=sources.release as {data:string}|null;
 if(release&&JSON.parse(release.data).status!=='released')gaps.push('The property release is not active. Review its current status before preparing title opening.');
 const ready=gaps.length===0;
 const cc=[input.parties.buyer,input.parties.acquisition,...(input.financing==='cash'?[]:[input.parties.lender])].filter(p=>p!==null);
 const body=ready?[`Fictional title-opening preparation for ${sources.property.address}.`,`Buyer: ${input.parties.buyer!.name}. Proposed closing: ${input.closingDate}. Financing: ${input.financing.replaceAll('_',' ')}.`,`The employee reports a signed purchase agreement on ${input.milestones.agreement!.date} (${input.milestones.agreement!.source}) and earnest money received on ${input.milestones.deposit!.date} (${input.milestones.deposit!.source}). These reports and attached source texts have not been independently verified.`,`Please review the supporting sources, confirm the appropriate parties and acknowledge the next title steps. No wire instructions or verified payment confirmation are supplied.`,...input.issues.filter(issue=>!issue.resolved).map(issue=>`Open issue: ${issue.description} (source: ${issue.source}${issue.dueDate?`; target ${issue.dueDate}`:''}).`)].join('\n\n'):'';
 return {reference,ready,gaps,cautions,to:ready?input.parties.attorney:null,cc:ready?cc:[],subject:ready?`Title-opening preparation — ${sources.property.address}`:'',body,files:ready?files:[],notice:'Unsent preparation only. Review source accuracy, recipient permissions and company procedure. No title was opened, no file delivered and no wire information generated.'};
}
export function getTransaction(actor:Actor,transactionId:string):TransactionDetail {
 const record=stored(actor,transactionId),sources=context(actor,record.input);
 // Historical source bindings are fixed to the same property/investor; document text is only resolved for current preparation.
 const history=(getDb().prepare('SELECT data FROM transaction_revisions WHERE transaction_id=? ORDER BY version DESC LIMIT 30').all(record.id) as {data:string}[]).map(row=>JSON.parse(row.data) as TransactionRecord);
 return {record,property:sources.property,investor:sources.investor,history,preparation:preparation(actor,record),canEdit:featureAccess(actor,'core').allowed,notice};
}
export function getTransactions(actor:Actor):TransactionBoard {
 assertActor(actor);const items=(getDb().prepare('SELECT data FROM transaction_coordination WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY rowid DESC').all(...scope(actor)) as {data:string}[]).flatMap(row=>{const record=JSON.parse(row.data) as TransactionRecord;try{const sources=context(actor,record.input);return [{id:record.id,version:record.version,property:sources.property.address,investor:sources.investor.name,closingDate:record.input.closingDate,openIssues:record.input.issues.filter(issue=>!issue.resolved).length,reportedMilestones:transactionMilestones.filter(key=>record.input.milestones[key]).length,updatedAt:record.updatedAt}];}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return [];throw error;}});
 return {items,properties:readProperties(actor),investors:readInvestors(actor),documents:communicationDocumentOptions(actor),canEdit:featureAccess(actor,'core').allowed,notice};
}
export function saveTransaction(actor:Actor,raw:SaveTransaction):TransactionDetail {
 assertActor(actor);requireFeature(actor,'core');const request=transactionSaveSchema.parse(raw);
 return getDb().transaction(()=>{
  const fingerprint=hash(request),prior=getDb().prepare('SELECT payload_hash,transaction_id FROM transaction_events WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),request.eventKey) as {payload_hash:string;transaction_id:string}|undefined;
  if(prior){if(prior.payload_hash!==fingerprint)throw new AppError(409,'This request key belongs to a different transaction update.');return getTransaction(actor,prior.transaction_id);}
  const previous=request.id?stored(actor,request.id):null;
  if((previous?.version??0)!==request.expectedVersion)throw new AppError(409,'This transaction changed. Compare its current version before saving.');
  if(previous&&(previous.input.propertyId!==request.input.propertyId||previous.input.investorId!==request.input.investorId))throw new AppError(409,'A transaction must retain its original property and investor. Create a separate record for another deal.');
  context(actor,request.input);validateDocuments(actor,request.input,true);
  for(const key of transactionMilestones){const report=request.input.milestones[key];if(report&&report.date>now().slice(0,10))throw new AppError(400,'Reported milestones cannot occur in the future. Use the closing target for a planned date.');}
  for(const role of transactionPartyRoles){const person=request.input.parties[role];if(person&&/[\r\n\u0000]/.test(person.email))throw new AppError(400,'Use a valid contact email.');}
  if(!previous){const count=getDb().prepare('SELECT COUNT(*) n FROM transaction_coordination WHERE organization_id=? AND office_id=? AND owner_id=?').get(...scope(actor)) as {n:number};if(count.n>=200)throw new AppError(409,'The demonstration has reached its 200-transaction limit.');}
  const stamp=now(),record:TransactionRecord={id:previous?.id??newId('transaction'),version:(previous?.version??0)+1,input:request.input,reportedBy:actor.id,createdAt:previous?.createdAt??stamp,updatedAt:stamp};
  if(previous)getDb().prepare('UPDATE transaction_coordination SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(record),record.id,...scope(actor));else getDb().prepare('INSERT INTO transaction_coordination VALUES(?,?,?,?,?)').run(record.id,...scope(actor),JSON.stringify(record));
  getDb().prepare('INSERT INTO transaction_revisions VALUES(?,?,?)').run(record.id,record.version,JSON.stringify(record));
  getDb().prepare('INSERT INTO transaction_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('transaction_event'),...scope(actor),request.eventKey,fingerprint,record.id,record.version,stamp);audit(actor,'transaction.reported',record.id,{version:record.version});return getTransaction(actor,record.id);
 }).immediate();
}
