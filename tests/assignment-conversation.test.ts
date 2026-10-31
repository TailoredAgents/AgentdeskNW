import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Actor,Artifact} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {createConversation,getConversation} from '../src/server/services';
import {createWorkRun,getWorkRun} from '../src/server/work-runs';
import {deriveWorkSourceReferences} from '../src/server/work-provenance';
import {withAssignment} from '../src/server/assignment-roots';
import {quoteCurrentAssignment} from '../src/server/assignment-metering';
import {getMeteredAssignment} from '../src/server/metered-work';
import {presentCurrentAssignmentQuote,getAssignmentReview,listAssignmentReviews} from '../src/server/assignment-reviews';
import {assignmentConversationIntent,assignmentConversationReference} from '../src/server/assignment-conversation';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {grantTrial} from '../src/server/billing';
import {acceptMessage,createPairing,messagingConversation,messagingState,type Outbox} from '../src/server/messaging';
import {processMessagingInbox,processMessagingOutbox} from '../src/server/messaging-worker';
import type {sendChannelMessage} from '../src/server/messaging-providers';
import {saveDocument,withdrawDocument} from '../src/server/documents';
import {fingerprint} from '../src/server/provider-runtime';

let actor:Actor,conversationId:string,sequence=0,directory='';
const key=()=>`spending-channel-${++sequence}`;
const advance=()=>vi.setSystemTime(Date.now()+100);
const account=`AC${'a'.repeat(32)}`,phone='+15555550102';
const input=(text:string,provider:'sms'|'slack'='sms')=>({provider,accountId:provider==='sms'?account:'TTEST',externalId:provider==='sms'?phone:'UTEST',address:provider==='sms'?phone:'DTEST',eventId:key(),text});
function link(provider:'sms'|'slack'='sms'){
 if(provider==='sms')grantTrial(demoActor('manager'),{userId:actor.id,features:['sms']});
 acceptMessage(input(createPairing(actor,provider).command,provider));
 getDb().prepare('DELETE FROM messaging_outbox').run();conversationId=messagingConversation(actor);
 return messagingState(actor).links.find(item=>item.provider===provider)!.id;
}
function fixture(summary='Review fictional facts and explain the next step.',artifacts:Artifact[]=[]){
 const work=createWorkRun(actor,{requestId:key(),title:'Fictional review',instructions:'Review property',steps:[{key:'read',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]}]});
 const host={kind:'work' as const,id:work.id};
 return withAssignment(actor,host,()=>{const assignment=quoteCurrentAssignment(actor,{title:'Fictional reasoning',scopeHash:fingerprint('scope'),revision:1,parts:[{key:'reason',rateId:'test-text-v1',feature:'core',maximumCalls:2,maximumUnits:{output_tokens:27000},estimatedUnits:{output_tokens:13500}}]});return {host,assignment,review:presentCurrentAssignmentQuote(actor,{summary,parts:[{key:'reason',label:'Read and explain the supplied facts'}]},artifacts)};});
}
const ask=(message:string,channel:'web'|'mobile'|'sms'|'slack'='web',requestId=key(),receivedAt?:string)=>chat(actor,message,conversationId,requestId,channel,{receivedAt});
const code=(text:string)=>text.match(/Approve (R[0-9A-F]{16})/)?.[1]??'';
const outbox=()=>getDb().prepare('SELECT * FROM messaging_outbox ORDER BY rowid').all() as Outbox[];
const send=vi.fn<typeof sendChannelMessage>(async(link)=>({id:link.provider==='sms'?`SM${(++sequence).toString(16).padStart(32,'0')}`:`receipt:${++sequence}`,status:link.provider==='sms'?'delivered':'accepted',segments:'1'}));
async function incoming(text:string,provider:'sms'|'slack'='sms'){advance();acceptMessage(input(text,provider));await processMessagingInbox();return getConversation(actor,conversationId).messages.at(-1)!.content;}
function enableText(){
 vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','admitted_demo');vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','2');vi.stubEnv('AGENTDESK_TEXT_MAX_INPUT_TOKENS','512');vi.stubEnv('AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','512');vi.stubEnv('AGENTDESK_TEXT_MAX_CONTEXT_BYTES','300000');
 vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS',JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional local acceptance tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}]));
 const transport=vi.fn(async(url:unknown)=>new Response(JSON.stringify(String(url).endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:40}:{id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'The original fictional request is finished.'}]}],usage:{input_tokens:20,output_tokens:10}})));
 vi.stubGlobal('fetch',transport);return transport;
}
beforeEach(()=>{
 closeDb();sequence=0;send.mockClear();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T16:00:00Z'));
 for(const [name,value] of Object.entries({AGENTDESK_DB_PATH:':memory:',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'',AGENTDESK_CHANNELS_ENABLED:'true',AGENTDESK_CHANNEL_SEND_ENABLED:'true',AGENTDESK_CHANNEL_PUBLIC_ORIGIN:'https://channels.example',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'mock-twilio',TWILIO_PHONE_NUMBER:'+15555550101',SLACK_TRANSPORT:'http',SLACK_SIGNING_SECRET:'mock-signing',SLACK_TEAM_ID:'TTEST',SLACK_APP_ID:'ATEST',SLACK_BOT_TOKEN:'mock-bot'}))vi.stubEnv(name,value);
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider request');}));actor=demoActor();conversationId=createConversation(actor).id;
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});

describe('exact employee spending decisions across conversation channels',()=>{
 it('recognizes whole requests without treating quoted or hypothetical text as authority',()=>{
  expect(assignmentConversationIntent('Could you please approve R1234567890ABCDEF?')).toEqual({action:'approve',target:'R1234567890ABCDEF'});
  for(const text of ['"Approve R1234567890ABCDEF"','Mike said approve R1234567890ABCDEF','If ready, approve R1234567890ABCDEF','Do not approve R1234567890ABCDEF','Transcript:\nApprove R1234567890ABCDEF'])expect(assignmentConversationIntent(text)).toBeNull();
 });
 it('shows complete scope and maximum, then accepts an exact mobile decision without a model call',async()=>{
  const {review}=fixture(),reference=assignmentConversationReference(review.id);
  expect((await ask('Show my spending')).result.message).toContain(reference);
  const shown=(await ask(`Review spending ${reference}`)).result.message;
  expect(shown).toContain('Read and explain the supplied facts');expect(shown).toContain('maximum $1.35');expect(code(shown)).toBeTruthy();
  const requestId=key(),decision=`Approve ${code(shown)}`;advance();const approved=await ask(decision,'mobile',requestId);expect(approved.result.message).toContain('original saved request');expect(getAssignmentReview(actor,review.id).state).toBe('ready');
  expect((await ask(decision,'mobile',requestId)).result).toEqual(approved.result);expect(fetch).not.toHaveBeenCalled();
 });
 it('denies without charge and never converts a repeated decline into approval',async()=>{
  const {review,assignment}=fixture(),shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);await ask(`Deny ${code(shown.result.message)}`);
  expect((await ask(`Approve ${code(shown.result.message)}`)).result.message).toContain('Cost declined');expect(getMeteredAssignment(actor,assignment.id).budget).toMatchObject({spentCents:0,status:'denied'});
 });
 it('does not infer authority from a vague yes or a guessed code',async()=>{
  const {review}=fixture();expect((await ask('yes')).result.message).toContain('general yes');expect((await ask('Approve R0000000000000000')).result.message).toContain('not available');expect(getAssignmentReview(actor,review.id).state).toBe('waiting');
 });
 it('keeps codes private to their employee and original conversation',async()=>{
  const {review}=fixture(),shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`),decision=`Approve ${code(shown.result.message)}`;
  const manager=demoActor('manager');expect((await chat(manager,decision,createConversation(manager).id,key())).result.message).toContain('not available');
  expect((await chat(actor,decision,createConversation(actor).id,key())).result.message).toContain('not available');expect(getAssignmentReview(actor,review.id).state).toBe('waiting');
 });
 it('rejects expired, future and pre-review decisions',async()=>{
  const {review}=fixture(),shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`),decision=`Approve ${code(shown.result.message)}`;
  expect((await ask(decision,'sms',key(),new Date().toISOString())).result.message).toContain('predates');
  expect((await ask(decision,'sms',key(),new Date(Date.now()+1000).toISOString())).result.message).toContain('predates');
  vi.setSystemTime(Date.now()+16*60_000);expect((await ask(decision)).result.message).toContain('expired');
 });
 it('invalidates the code and saved review text after a quote revision',async()=>{
  const {host,review,assignment}=fixture(),shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);
  withAssignment(actor,host,()=>quoteCurrentAssignment(actor,{title:assignment.title,scopeHash:fingerprint('changed'),revision:2,parts:assignment.parts.map(part=>({...part,maximumUnits:{output_tokens:40000}}))}));
  expect(getConversation(actor,conversationId).messages.at(-1)?.content).toContain('withheld');
  expect((await ask(`Approve ${code(shown.result.message)}`)).result.message).not.toContain('Approved the reviewed');
 });
 it('withholds saved review content and blocks decisions after source withdrawal',async()=>{
  const document=saveDocument(actor,{id:null,expectedVersion:0,eventKey:key(),input:{title:'Private fictional scope',fileName:'scope.txt',purpose:'repair_scope',sourceLabel:'Fictional',sourceDate:'2026-10-31',propertyId:null,investorId:null,content:'Private source facts.'}});
  const {review}=fixture('Private scoped summary',[{type:'document',id:document.document.id,title:'Scope',data:{documentAccessReference:document.reference!}}]);
  const shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);
  withdrawDocument(actor,{id:document.document.id,expectedVersion:document.document.version,eventKey:key(),reason:'Withdrawn fictional source'});
  expect(getConversation(actor,conversationId).messages.at(-1)?.content).toContain('withheld');expect((await ask(`Approve ${code(shown.result.message)}`)).result.message).toContain('changed');
 });
 it('sends long scopes to the app without issuing a partial SMS approval',async()=>{
  link();const {review}=fixture('Detailed fictional scope. '.repeat(50));const shown=await incoming(`Review spending ${assignmentConversationReference(review.id)}`);
  expect(shown).toContain('too long');expect(code(shown)).toBe('');expect(getDb().prepare('SELECT count(*) n FROM assignment_conversation_reviews').get()).toEqual({n:0});
 });
 it('requires a confirmed full SMS review before accepting its code',async()=>{
  link();const {review}=fixture(),shown=await incoming(`Review spending ${assignmentConversationReference(review.id)}`);expect(code(shown)).toBeTruthy();
  expect(await incoming(`Approve ${code(shown)}`)).toContain('not confirmed');expect(getAssignmentReview(actor,review.id).state).toBe('waiting');
  await processMessagingOutbox(send);expect(await incoming(`Approve ${code(shown)}`)).toContain('Approved the reviewed');expect(getAssignmentReview(actor,review.id).state).toBe('ready');
 });
 it('retains the exact code across a database close and reopen',async()=>{
  closeDb();directory=mkdtempSync(join(tmpdir(),'agentdesk-spending-conversation-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.sqlite'));actor=demoActor();conversationId=createConversation(actor).id;
  const {review}=fixture(),shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);closeDb();advance();expect((await ask(`Approve ${code(shown.result.message)}`)).result.message).toContain('Approved the reviewed');
 });
 it('preserves review provenance in derived work and invalidates it after a quote revision',async()=>{
  const {host,review,assignment}=fixture();await ask(`Review spending ${assignmentConversationReference(review.id)}`);
  const requestId=key(),references=deriveWorkSourceReferences(actor,conversationId,requestId);
  expect(references.assignmentReviews).toHaveLength(1);
  const job=createWorkRun(actor,{requestId,title:'Review from conversation',instructions:'Use the current supplied context',sourceReferences:references,steps:[{key:'read',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]}]});
  expect(getWorkRun(actor,job.id).contentRestricted).not.toBe(true);
  withAssignment(actor,host,()=>quoteCurrentAssignment(actor,{title:assignment.title,scopeHash:fingerprint('changed'),revision:2,parts:assignment.parts.map(part=>({...part,maximumUnits:{output_tokens:40000}}))}));
  expect(getWorkRun(actor,job.id).contentRestricted).toBe(true);
 });
 it('never exposes employee approval as a model tool',async()=>{
  const {toolDefinitions}=await import('../src/server/orchestrator');expect(toolDefinitions().map(tool=>tool.name).some(name=>/assignment.*(?:approve|decision)|approve.*assignment/i.test(name))).toBe(false);
 });
});

describe('original-channel admitted-text completion',()=>{
 it.each(['sms','slack'] as const)('reviews, approves and returns the original %s result once',async provider=>{
  link(provider);const transport=enableText();await incoming('Explain my fictional next steps.',provider);
  const review=listAssignmentReviews(actor)[0];expect(review.maximumCents).toBe(205);expect(transport).not.toHaveBeenCalled();
  await processMessagingOutbox(send);const shown=await incoming(`Review spending ${assignmentConversationReference(review.id)}`,provider);expect(code(shown)).toBeTruthy();
  await processMessagingOutbox(send);expect(await incoming(`Approve ${code(shown)}`,provider)).toContain('Approved the reviewed');await processMessagingOutbox(send);
  expect(await processApprovedTextRequests(actor)).toBe(1);const completion=outbox().filter(row=>row.dedupe_key.startsWith('text-result:'));expect(completion).toHaveLength(1);expect(completion[0].status).toBe('queued');
  expect(getConversation(actor,conversationId).messages.filter(message=>message.content==='Explain my fictional next steps.')).toHaveLength(1);
  await processMessagingOutbox(send);expect(send.mock.calls.at(-1)?.[2]).toContain('original fictional request is finished');expect(await processApprovedTextRequests(actor)).toBe(0);await processMessagingOutbox(send);expect(outbox().filter(row=>row.dedupe_key.startsWith('text-result:'))).toHaveLength(1);expect(transport).toHaveBeenCalledTimes(2);
 });
 it('keeps the result in the app after STOP, without rerouting it to another connection',async()=>{
  link();link('slack');enableText();await incoming('Explain my fictional next steps.');const review=listAssignmentReviews(actor)[0];const shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);await ask(`Approve ${code(shown.result.message)}`);
  acceptMessage(input('STOP'));expect(await processApprovedTextRequests(actor)).toBe(1);expect(outbox().some(row=>row.dedupe_key.startsWith('text-result:'))).toBe(false);expect(getConversation(actor,conversationId).messages.at(-1)?.content).toContain('original fictional request is finished');
 });
 it('does not send a saved result to a changed destination',async()=>{
  const linked=link('slack');enableText();await incoming('Explain my fictional next steps.','slack');const review=listAssignmentReviews(actor)[0],shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);await ask(`Approve ${code(shown.result.message)}`);
  getDb().prepare('UPDATE messaging_links SET address=? WHERE id=?').run('DCHANGED',linked);expect(await processApprovedTextRequests(actor)).toBe(1);expect(outbox().some(row=>row.dedupe_key.startsWith('text-result:'))).toBe(false);
 });
 it('keeps uncertain completion delivery unresolved without another send or paid request',async()=>{
  link();const transport=enableText();await incoming('Explain my fictional next steps.');await processMessagingOutbox(send);const review=listAssignmentReviews(actor)[0],shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);await ask(`Approve ${code(shown.result.message)}`);await processApprovedTextRequests(actor);
  const uncertain=vi.fn<typeof sendChannelMessage>(async()=>{throw new Error('unknown transport');});await processMessagingOutbox(uncertain);await processMessagingOutbox(uncertain);expect(uncertain).toHaveBeenCalledTimes(1);expect(outbox().find(row=>row.dedupe_key.startsWith('text-result:'))?.status).toBe('unknown');expect(await processApprovedTextRequests(actor)).toBe(0);expect(transport).toHaveBeenCalledTimes(2);
 });
 it('atomically recovers result publication and its outbox entry after a checkpoint failure',async()=>{
  link();const transport=enableText();await incoming('Explain my fictional next steps.');const review=listAssignmentReviews(actor)[0],shown=await ask(`Review spending ${assignmentConversationReference(review.id)}`);await ask(`Approve ${code(shown.result.message)}`);
  getDb().exec("CREATE TEMP TRIGGER reject_result_queue BEFORE INSERT ON messaging_outbox WHEN NEW.dedupe_key LIKE 'text-result:%' BEGIN SELECT RAISE(ABORT,'test interruption'); END;");
  expect(await processApprovedTextRequests(actor)).toBe(0);expect(getConversation(actor,conversationId).messages.some(message=>message.content==='The original fictional request is finished.')).toBe(false);
  getDb().exec('DROP TRIGGER reject_result_queue');expect(await processApprovedTextRequests(actor)).toBe(1);expect(outbox().filter(row=>row.dedupe_key.startsWith('text-result:'))).toHaveLength(1);expect(transport).toHaveBeenCalledTimes(2);
 });
});
