import {relationshipGuidance,relationshipMethodFingerprint} from './relationship-methods';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,Task} from '../lib/contracts';
import type {CommunicationDraft,CommunicationMessage,CreateInboxFollowUp,InboxAssistance,InboxFollowUpResult,InboxMutation,InboxObservationResult,InboxSendReceipt,InboxSendResult,InboxSendReview,InboxThreadDetail,RecordInboxObservation,SimulateInboxSend} from '../lib/communications-contracts';
import {AppError,audit,getDb,newId,now,requireRole} from './db';
import {featureAccess,requireFeature} from './billing';
import {readInvestorRow,writableInvestor} from './access';
import {getInboxThread,saveInboxDraft} from './communications';
import {requireCommunicationCapability} from './communications-capabilities';
import {getEmployeeMemory} from './memory';
import {getInvestorJourney,recordJourneyObservation} from './journey';
import {createTask} from './services';
import {getPersonalTask} from './task-actions';

const id=z.string().trim().min(1).max(150);
const mutation={expectedVersion:z.number().int().positive(),eventKey:id};
export const inboxWorkflowMutationSchema=z.object(mutation).strict();
export const simulateInboxSendSchema=z.object({reviewId:id,eventKey:id}).strict();
export const inboxObservationSchema=z.object({...mutation,messageId:id,kind:z.enum(['objection','preference']),text:z.string().trim().min(3).max(1600)}).strict();
export const inboxFollowUpSchema=z.object({...mutation,messageId:id,title:z.string().trim().min(3).max(240),dueAt:z.string().datetime({offset:true}).nullable()}).strict();
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const simulationNotice='Simulated send only. This reply is stored in your fictional inbox; no email or text was delivered and no provider or wallet charge was incurred.';
function current(actor:Actor,threadId:string){const detail=getInboxThread(actor,id.parse(threadId));requireFeature(actor,'core');if(detail.account.access==='revoked')throw new AppError(403,detail.capabilityNotice);return detail;}
function expected(detail:InboxThreadDetail,version:number){if(detail.thread.version!==version)throw new AppError(409,'This conversation changed. Reload it and review the current information.');}
function inbound(detail:InboxThreadDetail,messageId:string){const message=detail.messages.find(item=>item.id===messageId&&item.direction==='inbound');if(!message)throw new AppError(404,'The incoming source message was not found in this private conversation.');return message;}
function linked(detail:InboxThreadDetail){const investor=detail.thread.association.investor;if(!investor)throw new AppError(409,'Review and link a permitted investor before recording relationship work.');return investor;}
function canObserve(actor:Actor,detail:InboxThreadDetail){try{if(!['dispositions','manager'].includes(actor.role))return false;writableInvestor(actor,linked(detail).id);return true;}catch{return false;}}
function canFollowUp(actor:Actor,detail:InboxThreadDetail){if(!featureAccess(actor,'daily-coordinator').allowed)return false;const investor=detail.thread.association.investor;return !investor||readInvestorRow(actor,investor.id).office_id===actor.officeId;}

/** Bounded, inspectable reasoning over one private conversation. Source text cannot choose tools or write facts. */
export function getInboxAssistance(actor:Actor,threadId:string):InboxAssistance {
 const detail=current(actor,threadId),memory=getEmployeeMemory(actor),messages=detail.messages.slice(-12),latest=[...messages].reverse().find(item=>item.direction==='inbound');
 if(!detail.account.capabilities.readBody)return {workingMethod:null,threadId,threadVersion:detail.thread.version,summary:'Only sender, recipients and message time are available. The subject and body were not captured.',nextStep:'Obtain approved access to the original message before preparing a reply or recording what the investor said.',sources:messages.map(message=>({id:message.id,kind:'message',label:message.sourceLabel,excerpt:`Headers only · from ${message.from.name} <${message.from.address}> · received ${message.receivedAt}. Subject and body unavailable.`,recordedAt:message.receivedAt,verification:'fictional_headers_only'})),unknowns:[detail.capabilityNotice,'The message topic, request and investor intent cannot be inferred from metadata.'],suggestedReply:{subject:'Subject unavailable · headers only',body:'',scope:'relationship_only',deliveryStatus:'not_sent',eligible:false,reasons:[detail.capabilityNotice]},suggestedObservation:null,suggestedFollowUp:null,preferencesUsed:{tone:memory.tone,length:memory.length,avoidPhrases:memory.avoidPhrases,priorities:memory.priorities,version:memory.version},canRecordObservation:false,canCreateFollowUp:false,processing:{mode:'deterministic',messageCount:0,messageLimit:12,background:false,walletChargeCents:0,notice:'Metadata-only review. No message body was available or analyzed; no model request or wallet charge.'},synthetic:true};
 const journey=detail.investorContext,latestText=latest?.body??'';
 const repair=/\b(repair|rehab|renovation|contractor|scope of work)\b/i.test(latestText);
 const operating=/\b(operating|taxes|insurance|expenses|rental|rent)\b/i.test(latestText);
 const timing=/\b(timing|timeline|pause|later|month|days|week)\b/i.test(latestText);
 const repairIssue=journey?.openIssues.find(item=>/\b(repair|rehab|contractor)\b/i.test(item.text)),priorRepair=!!repairIssue;
 const latestTopic=repair?'repair':operating?'operating':timing?'timing':'general';
 const conflict=journey?.record.conflicts[0];
 const paused=journey?.activity==='paused',priorIssue=journey?.openIssues[0],priorTask=journey?.commitments[0];
 const topic=latestTopic==='general'&&priorRepair?'repair':latestTopic;
 const latestSummary=latestTopic==='repair'?'The latest incoming correspondence raises repair scope or cost questions.':latestTopic==='operating'?'The latest incoming message raises rental or operating-cost questions.':latestTopic==='timing'?'The latest incoming message mentions buying timing.':'The latest incoming message does not establish a specific new repair, operating-cost or timing concern.';
 const relationshipSummary=paused?' The current relationship record is paused; confirm permission to resume before discussing new opportunities.':conflict?' Differing '+conflict.label.toLowerCase()+' are recorded; clarify the sources before relying on those criteria.':priorIssue?' An unresolved employee-reported concern remains in the journey; a new message does not resolve it.':priorTask?' An open personal follow-up remains; review it before promising new work.':'';
 const summary=latestSummary+relationshipSummary;
 const nextStep=paused?'Respect the recorded pause. Confirm whether to address the current question now or agree a future check-in.':conflict?conflict.question!:topic==='repair'?'Check availability of a sourced repair breakdown and contractor review. Separate supported figures from assumptions before another walkthrough.':topic==='operating'?'Confirm which operating-cost assumptions need supporting records.':topic==='timing'?'Ask the investor to confirm current timing and changes to buying criteria.':priorIssue?'Confirm whether the previously reported concern is still unresolved before another property pitch.':priorTask?`Review the existing personal follow-up before adding duplicate work: ${priorTask.title}`:'Clarify the question and review the relationship match before discussing opportunities.';
 const repairRequest=/\b(breakdown|figures|costs?)\b/i.test(latestText);
 const core=paused?'I have your buying plans marked as paused. Would you like to address the questions in your message now, or choose a later time to check in?':conflict?'Could you confirm your current '+conflict.label.toLowerCase()+'? I have differing information recorded and want to clarify it before suggesting the next step.':topic==='repair'?(latestTopic!=='repair'?'Before considering another opportunity, is the previously raised repair-cost concern still unresolved? We should confirm what information would address it.':repairRequest?(memory.length==='concise'?'Understood: repair details first. The next step is to separate sourced figures from assumptions and identify what still needs a contractor’s review. Availability and accuracy still need checking.':'I understand that you want clarity on the repair breakdown before another walkthrough. The next step is to separate sourced figures from assumptions and identify what still needs a contractor’s review. I cannot yet confirm that a breakdown or contractor review is available.'):'Let’s clarify the renovation scope before considering anything else. Which limits have changed, and what information would help us assess them?'):topic==='operating'?'Let’s review the operating-cost assumptions before planning a walkthrough. The next step is to identify which figures have supporting records and which still need verification.':topic==='timing'?'What purchase timing works for you now, and have your buying criteria changed?':priorIssue?'Before we take the next step, is the previously raised concern still unresolved? What would help clarify it?':'What would you like clarified before we take the next step?';
 const firstName=detail.thread.association.investor?.name.split(' ')[0]??'there';
 const optional=(text:string)=>memory.avoidPhrases.some(phrase=>text.toLowerCase().includes(phrase.toLowerCase()))?'':text;
 const greeting=memory.tone==='direct'?`${firstName},`:`Hi ${firstName},`;
 const warmth=memory.tone==='warm'&&memory.length!=='concise'?optional(' Thank you for explaining what matters to you.'):'';
 const additional=memory.length==='detailed'?optional(' I want to confirm the supporting information before making any claims about a specific property.'):'';
 const body=`${greeting}${warmth}\n\n${core}${additional}`;
 const sources:InboxAssistance['sources']=messages.map(message=>({id:message.id,kind:'message',label:`${message.direction==='inbound'?'Incoming':'Outgoing'} ${detail.thread.channel} · ${message.sourceLabel}`,excerpt:message.body.slice(0,1000),recordedAt:message.receivedAt,verification:message.deliveryStatus==='simulated_sent'?'simulated_outgoing':'fictional_unverified_correspondence'}));
 if(journey){
  const priorityIds=[conflict?.buyBoxId,...(conflict?.reports.map(report=>report.id)??[]),repairIssue?.id,priorIssue?.id,priorTask?.id].filter(Boolean);
  const evidence=journey.evidence.filter(item=>!item.propertyId||priorityIds.includes(item.sourceRecordId)).sort((a,b)=>Number(priorityIds.includes(b.sourceRecordId))-Number(priorityIds.includes(a.sourceRecordId)));
  sources.push({id:`activity:${journey.investorId}`,kind:'relationship',label:'Recorded relationship activity',excerpt:`Current recorded activity: ${journey.activity}. This is a saved relationship status, not verification of the latest sender’s intent.`,recordedAt:null,verification:'recorded_relationship_activity'});
  sources.push(...evidence.slice(0,5).map(item=>({id:item.id,kind:'relationship' as const,label:item.label,excerpt:item.text.slice(0,600),recordedAt:item.recordedAt,verification:item.verification,propertyId:item.propertyId})));
 }
 const observation=latestTopic==='repair'?'Employee reviewed correspondence raising a need to clarify repair scope and cost assumptions before another opportunity.':latestTopic==='operating'?'Employee reviewed correspondence requesting more clarity about rental or operating-cost assumptions.':latestTopic==='timing'?'Employee reviewed correspondence suggesting purchase timing should be confirmed.':null;
 const title=paused?'Confirm a suitable check-in while buying plans are paused':conflict?'Clarify the differing '+conflict.label.toLowerCase():topic==='repair'?'Verify repair-scope information and contractor-review availability':topic==='operating'?'Check supporting information for operating-cost questions':topic==='timing'?'Confirm current buying timeline and criteria':'Review the latest investor question and next step';
 const unknowns=[...(!detail.account.capabilities.threadHistory?[detail.capabilityNotice]:[]),...(journey?.unknowns??[]),'Incoming correspondence is fictional, unverified source material; it does not approve CRM or memory changes.','Property details and attachments require the separate eligible Deal packages workflow.'];
 if(topic==='repair')unknowns.push('A sourced repair breakdown, contractor availability and estimate accuracy have not been established.');
 if(!journey)unknowns.push('Review the investor association before using relationship history or recording an observation.');
 if(messages.some(item=>item.attachments.length))unknowns.push('Attachment metadata is available, but file contents have not been read or forwarded.');
 if(detail.messages.length>messages.length)unknowns.push(`Only the latest ${messages.length} of ${detail.messages.length} messages were analyzed.`);
 const workingMethod=journey?relationshipGuidance(journey,paused?'confirm_timing':conflict?'clarify_qualification':topic==='repair'||topic==='operating'||priorIssue?'resolve_objection':priorTask?'fulfill_commitment':'clarify_qualification',actor.role,topic):null;
 return {workingMethod,threadId,threadVersion:detail.thread.version,summary,nextStep,sources,unknowns,suggestedReply:{subject:detail.thread.channel==='sms'?detail.thread.subject:'Following up on your questions',body,scope:'relationship_only',deliveryStatus:'not_sent',eligible:!memory.avoidPhrases.some(phrase=>body.toLowerCase().includes(phrase.toLowerCase())),reasons:memory.avoidPhrases.some(phrase=>body.toLowerCase().includes(phrase.toLowerCase()))?['A saved phrase preference conflicts with necessary wording. Review that preference before preparing this reply; required caveats will not be removed.']:[]},suggestedObservation:latest&&observation&&journey?{messageId:latest.id,kind:latestTopic==='timing'?'preference':'objection',text:observation}:null,suggestedFollowUp:latest?{messageId:latest.id,title,dueAt:null}:null,preferencesUsed:{tone:memory.tone,length:memory.length,avoidPhrases:memory.avoidPhrases,priorities:memory.priorities,version:memory.version},canRecordObservation:canObserve(actor,detail),canCreateFollowUp:canFollowUp(actor,detail),processing:{mode:'deterministic',messageCount:messages.length,messageLimit:12,background:false,walletChargeCents:0,notice:'On-demand review of this conversation’s latest 12 messages and permitted relationship records. No background mailbox analysis or model request; no wallet charge. Copilot chat itself retains its existing model usage limits.'},synthetic:true};
}

export function prepareInboxReply(actor:Actor,threadId:string,input:InboxMutation):InboxThreadDetail {
 const parsed=inboxWorkflowMutationSchema.parse(input),detail=current(actor,threadId);requireCommunicationCapability(detail.account,'localDraft');const assistance=getInboxAssistance(actor,threadId);
 if(!assistance.suggestedReply.eligible)throw new AppError(409,assistance.suggestedReply.reasons.join(' '));
 return saveInboxDraft(actor,threadId,{...parsed,body:assistance.suggestedReply.body,...(detail.thread.channel==='email'?{subject:assistance.suggestedReply.subject}:{})},'copilot');
}
function contextHash(actor:Actor,detail:InboxThreadDetail){
 const journey=detail.investorContext?{...detail.investorContext,generatedAt:undefined,record:{...detail.investorContext.record,generatedAt:undefined}}:null;
 const investor=detail.thread.association.investor?readInvestorRow(actor,detail.thread.association.investor.id):null;
 const protectedData=getDb().prepare('SELECT data FROM property_releases WHERE organization_id=? AND office_id=? ORDER BY id').all(actor.organizationId,actor.officeId);
 const organization=getDb().prepare('SELECT settings FROM organizations WHERE id=?').get(actor.organizationId);
 return hash({workingMethods:relationshipMethodFingerprint(),actor,thread:detail.thread,account:detail.account,draft:detail.draft,messageIds:detail.messages.map(item=>item.id),journey,investor,memory:getEmployeeMemory(actor),protectedData,organization});
}
function eligibleDraft(actor:Actor,detail:InboxThreadDetail){
 const draft=detail.draft;if(!draft)throw new AppError(409,'Prepare and save a reply before reviewing a simulated send.');
 if(draft.authorship!=='employee'){
  const generated=getInboxAssistance(actor,detail.thread.id).suggestedReply;
  if(!generated.eligible)throw new AppError(409,generated.reasons.join(' '));
  if(draft.body!==generated.body||draft.subject!==generated.subject||(draft.cc?.length??0)>0)throw new AppError(409,'This generated reply is no longer current. Prepare it again, or save your own edited reply before reviewing it.');
 }
 if(detail.thread.association.status==='unavailable')throw new AppError(403,'The relationship context is no longer available. Review the association before preparing a new reply.');
 return draft;
}
export function reviewInboxSend(actor:Actor,threadId:string,input:InboxMutation):InboxSendReview {
 const parsed=inboxWorkflowMutationSchema.parse(input);
 return getDb().transaction(()=>{
  const detail=current(actor,threadId);requireCommunicationCapability(detail.account,'simulateSend');const payloadHash=hash({threadId,input:parsed});
  const prior=getDb().prepare('SELECT payload_hash,context_hash,data FROM communication_send_reviews WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),parsed.eventKey) as {payload_hash:string;context_hash:string;data:string}|undefined;
  if(prior){if(prior.payload_hash!==payloadHash)throw new AppError(409,'This review request key was used for different content.');const value=JSON.parse(prior.data) as InboxSendReview;if(prior.context_hash!==contextHash(actor,detail)||value.expiresAt<=now())throw new AppError(409,'This review is stale. Review the current reply again.');return value;}
  expected(detail,parsed.expectedVersion);const draft=eligibleDraft(actor,detail),timestamp=now();
  const review:InboxSendReview={id:newId('send_review'),threadId,threadVersion:detail.thread.version,draftId:draft.id,draftVersion:draft.version,accountId:detail.account.id,accountContext:{source:detail.account.source,transport:detail.account.transport,capabilities:detail.account.capabilities,accessVersion:detail.account.accessVersion},channel:detail.thread.channel,from:draft.from,to:draft.to,cc:draft.cc??[],authorship:draft.authorship??'copilot',subject:draft.subject,body:draft.body,attachments:[],createdAt:timestamp,expiresAt:new Date(Date.now()+10*60_000).toISOString(),scope:draft.authorship==='employee'?'employee_correspondence':'relationship_only',notice:simulationNotice,liveDelivery:false};
  getDb().prepare('INSERT INTO communication_send_reviews VALUES(?,?,?,?,?,?,?,?,?)').run(review.id,...scope(actor),threadId,parsed.eventKey,payloadHash,contextHash(actor,detail),JSON.stringify(review));audit(actor,'communications.send.reviewed',review.id);return review;
 }).immediate();
}
function updateThread(actor:Actor,threadId:string,changes:Record<string,unknown>={}){
 const row=getDb().prepare('SELECT data FROM communication_threads WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(threadId,...scope(actor)) as {data:string};const original=JSON.parse(row.data);
 getDb().prepare('UPDATE communication_threads SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify({...original,...changes,version:original.version+1,updatedAt:now()}),threadId,...scope(actor));
}
export function simulateInboxSend(actor:Actor,threadId:string,input:SimulateInboxSend):InboxSendResult {
 const parsed=simulateInboxSendSchema.parse(input);
 return getDb().transaction(()=>{
  const detail=current(actor,threadId);requireCommunicationCapability(detail.account,'simulateSend');const payloadHash=hash({threadId,input:parsed});
  const prior=getDb().prepare('SELECT payload_hash,data FROM communication_send_receipts WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),parsed.eventKey) as {payload_hash:string;data:string}|undefined;
  if(prior){if(prior.payload_hash!==payloadHash)throw new AppError(409,'This send request key was used for a different simulation.');return {detail,receipt:JSON.parse(prior.data) as InboxSendReceipt};}
  const row=getDb().prepare('SELECT context_hash,data FROM communication_send_reviews WHERE id=? AND thread_id=? AND organization_id=? AND office_id=? AND owner_id=?').get(parsed.reviewId,threadId,...scope(actor)) as {context_hash:string;data:string}|undefined;
  if(!row)throw new AppError(404,'The exact-message review was not found in this private conversation.');
  if(getDb().prepare('SELECT 1 FROM communication_send_receipts WHERE review_id=?').get(parsed.reviewId))throw new AppError(409,'This reviewed reply was already simulated.');
  const review=JSON.parse(row.data) as InboxSendReview;
  if(review.expiresAt<=now()||row.context_hash!==contextHash(actor,detail))throw new AppError(409,'The reply, conversation, preferences or relationship context changed. Review the current reply again.');
  const draft=eligibleDraft(actor,detail);if(detail.messages.length>=200)throw new AppError(409,'This conversation has reached its demonstration message limit.');
  const timestamp=now(),receiptId=newId('send_receipt');
  const message:CommunicationMessage={id:newId('inbox_message'),threadId,accountId:review.accountId,direction:'outbound',from:review.from,to:[review.to],cc:review.cc??[],subject:review.subject,body:review.body,receivedAt:timestamp,sourceRef:`demo:simulated:${review.id}`,sourceLabel:'Employee-reviewed simulated reply · no external delivery',deliveryStatus:'simulated_sent',attachments:[],synthetic:true};
  getDb().prepare('INSERT INTO communication_messages VALUES(?,?,?,?,?,?,?,?)').run(message.id,...scope(actor),review.accountId,threadId,message.sourceRef,JSON.stringify(message));
  const archived:CommunicationDraft={...draft,status:'discarded',deliveryStatus:'simulated_sent',version:draft.version+1,updatedAt:timestamp};
  getDb().prepare("UPDATE communication_drafts SET status='discarded',data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?").run(JSON.stringify(archived),draft.id,...scope(actor));
  getDb().prepare('INSERT INTO communication_draft_revisions VALUES(?,?,?,?,?,?,?,?)').run(newId('draft_revision'),...scope(actor),threadId,draft.id,archived.version,JSON.stringify(archived));
  updateThread(actor,threadId,{status:'waiting',unread:false,lastMessageAt:timestamp,preview:message.body.slice(0,180),messageCount:detail.messages.length+1});
  const receipt:InboxSendReceipt={id:receiptId,reviewId:review.id,threadId,messageId:message.id,simulatedAt:timestamp,status:'simulated_sent',notice:simulationNotice,liveDelivery:false};
  getDb().prepare('INSERT INTO communication_send_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(receipt.id,...scope(actor),threadId,review.id,parsed.eventKey,payloadHash,JSON.stringify(receipt));audit(actor,'communications.send.simulated',receipt.id);
  return {detail:getInboxThread(actor,threadId),receipt};
 }).immediate();
}

interface WorkflowSource {kind:'observation'|'follow_up';recordId:string;investorId:string|null;messageId:string;sourceRef:string;reviewedText:string;createdAt:string}
function priorAction(actor:Actor,key:string,payload:unknown){const row=getDb().prepare('SELECT payload_hash,data FROM communication_workflow_actions WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),key) as {payload_hash:string;data:string}|undefined;if(row&&row.payload_hash!==hash(payload))throw new AppError(409,'This workflow request key was used for different reviewed work.');return row?JSON.parse(row.data) as WorkflowSource:null;}
function recordAction(actor:Actor,threadId:string,key:string,payload:unknown,source:WorkflowSource){getDb().prepare('INSERT INTO communication_workflow_actions VALUES(?,?,?,?,?,?,?,?)').run(newId('inbox_action'),...scope(actor),threadId,key,hash(payload),JSON.stringify(source));audit(actor,`communications.${source.kind}.reviewed`,source.recordId);}
export function recordInboxObservation(actor:Actor,threadId:string,input:RecordInboxObservation):InboxObservationResult {
 const parsed=inboxObservationSchema.parse(input);
 return getDb().transaction(()=>{
  const detail=current(actor,threadId);requireCommunicationCapability(detail.account,'readBody');requireRole(actor,['dispositions','manager']);const investor=linked(detail);writableInvestor(actor,investor.id);const source=inbound(detail,parsed.messageId),payload={kind:'observation',threadId,input:parsed},prior=priorAction(actor,parsed.eventKey,payload);
  if(prior){const observation=getInvestorJourney(actor,investor.id).observations.find(item=>item.id===prior.recordId);if(!observation)throw new AppError(409,'The reviewed observation no longer belongs to the current relationship.');return {detail,observation};}
  expected(detail,parsed.expectedVersion);
  const observation=recordJourneyObservation(actor,{investorId:investor.id,kind:parsed.kind,text:parsed.text,eventKey:`inbox:${hash({threadId,eventKey:parsed.eventKey})}`},{channel:detail.thread.channel,receivedAt:source.receivedAt,label:'Employee-reviewed fictional correspondence'});
  recordAction(actor,threadId,parsed.eventKey,payload,{kind:'observation',recordId:observation.id,investorId:investor.id,messageId:source.id,sourceRef:source.sourceRef,reviewedText:parsed.text,createdAt:now()});updateThread(actor,threadId);
  return {detail:getInboxThread(actor,threadId),observation};
 }).immediate();
}
export function createInboxFollowUp(actor:Actor,threadId:string,input:CreateInboxFollowUp):InboxFollowUpResult {
 const parsed=inboxFollowUpSchema.parse(input);
 return getDb().transaction(()=>{
  const detail=current(actor,threadId);requireCommunicationCapability(detail.account,'readBody');requireFeature(actor,'daily-coordinator');const source=inbound(detail,parsed.messageId),investorId=detail.thread.association.investor?.id??null,payload={kind:'follow_up',threadId,input:parsed},prior=priorAction(actor,parsed.eventKey,payload);
  if(detail.thread.association.status==='unavailable')throw new AppError(403,'Review the unavailable relationship association before scheduling work.');
  if(prior)return {detail,task:getPersonalTask(actor,prior.recordId)};
  expected(detail,parsed.expectedVersion);if(parsed.dueAt&&Date.parse(parsed.dueAt)<=Date.now())throw new AppError(400,'Choose a future reminder time or leave the task without a deadline.');
  const task:Task=createTask(actor,{title:parsed.title,dueAt:parsed.dueAt,investorId});
  recordAction(actor,threadId,parsed.eventKey,payload,{kind:'follow_up',recordId:task.id,investorId,messageId:source.id,sourceRef:source.sourceRef,reviewedText:parsed.title,createdAt:now()});updateThread(actor,threadId);
  return {detail:getInboxThread(actor,threadId),task};
 }).immediate();
}
