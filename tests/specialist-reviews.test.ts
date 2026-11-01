import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {getConversation,createTask,listTasks} from '../src/server/services';
import {listAssignmentReviews,decideAssignmentReview,cancelAssignmentReview} from '../src/server/assignment-reviews';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {getMeteredAssignment} from '../src/server/metered-work';
import {getAssignmentBinding,withAssignment} from '../src/server/assignment-roots';
import {readTextExecution} from '../src/server/text-execution';
import {controlTextAssignment} from '../src/server/text-controls';
import {reconcileStoppedTextUsage} from '../src/server/text-reconciliation';
import {grantTrial} from '../src/server/billing';
import {createPairing,acceptMessage,messagingConversation,messagingState} from '../src/server/messaging';
import {processMessagingInbox,processMessagingOutbox} from '../src/server/messaging-worker';

let sequence=0,directory='';
const key=()=>`specialist-${++sequence}`,actor=()=>demoActor();
type Item=Record<string,unknown>;
const message=(text:string):Item=>({type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]});
const call=(name:string,args:unknown,callId=name):Item=>({type:'function_call',status:'completed',name,call_id:callId,arguments:JSON.stringify(args)});
const reviewArgs=(evidence=['journey'])=>({specialistId:'investor-relationship',question:'What concern should we resolve before the next follow-up?',evidenceCallIds:evidence});
const consult=(args=reviewArgs(),id='consult')=>call('consult_specialist',args,id);
const journey=()=>call('investor_journey',{investorId:'investor-mike'},'journey');
const assessment=(evidence=['journey'])=>({conclusion:'Resolve the reported repair uncertainty before preparing a follow-up.',evidence:evidence.map(callId=>({callId,observation:'The supplied journey contains the reported investor context.'})),assumptions:[],missingInformation:['A supported repair breakdown.'],recommendedNextSteps:['Ask for the missing repair details.'],limitations:['Fictional source data; no message was sent.']});
const final='The specialist review is saved. Ask for repair details before preparing the next message.';
const receipt=(output:Item[])=>({id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:20,output_tokens:10}});
function tariff(nanos=1000000){vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS',JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional specialist transport acceptance tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:nanos,cached_input_tokens:0,output_tokens:nanos}}]));}
function transport(rounds:Item[][]=[[journey()],[consult()],[message(JSON.stringify(assessment()))],[message(final)]],hook?:(round:number,payload:Item)=>void|Promise<void>){
 let n=0;const payloads:Item[]=[];
 const fetcher=vi.fn(async(url:unknown,options?:RequestInit)=>{
  if(String(url).endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40}));
  const payload=JSON.parse(String(options?.body));payloads.push(payload);const index=n++;
  await hook?.(index,payload);
  if(!rounds[index])throw new Error('Unexpected extra model dispatch');
  return new Response(JSON.stringify(receipt(rounds[index])));
 });vi.stubGlobal('fetch',fetcher);return {fetcher,payloads};
}
const review=()=>listAssignmentReviews(actor())[0];
const decision=(r=review())=>({quoteId:r.quoteId,revision:r.revision,eventKey:key()});
function approve(r=listAssignmentReviews(actor()).find(item=>item.canDecide)!){return decideAssignmentReview(actor(),r.id,{...decision(r),decision:'approve'});}
function control(action:'pause'|'continue'|'revise',r=review(),instructions?:string){return controlTextAssignment(actor(),r.id,{...decision(r),action,...(instructions?{instructions}:{})});}
async function start(conversationId?:string,text='Review Mike’s relationship context and recommend the next appropriate follow-up.'){const requestId=key(),result=await chat(actor(),text,conversationId,requestId);return {requestId,...result};}
function assignment(){const row=getDb().prepare('SELECT id FROM metered_assignments ORDER BY rowid DESC LIMIT 1').get() as {id:string};return getMeteredAssignment(actor(),row.id);}
const saved=(id:string)=>withAssignment(actor(),{kind:'turn',id},()=>readTextExecution(actor(),id)!);
const consultations=()=>getDb().prepare("SELECT result FROM assistant_tool_receipts WHERE json_extract(result,'$.data.kind')='specialist_review'").all() as {result:string}[];
beforeEach(()=>{
 closeDb();sequence=0;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
 for(const [name,value] of Object.entries({AGENTDESK_DB_PATH:':memory:',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'mock-key-never-sent',OPENAI_MODEL:'gpt-6-astra',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'5',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000'}))vi.stubEnv(name,value);
 tariff();vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});

describe('focused specialist reasoning inside the original admitted request',()=>{
 it('reviews actual earlier evidence, then returns to the master within one approval and cap',async()=>{
  const {fetcher,payloads}=transport(),original=await start(),root=getAssignmentBinding(actor(),{kind:'turn',id:original.requestId});
  expect(fetcher).not.toHaveBeenCalled();expect(review().maximumCents).toBe(512);approve();expect(await processApprovedTextRequests(actor())).toBe(1);
  expect(payloads).toHaveLength(4);expect(payloads[2]).toMatchObject({tools:[],text:{format:{type:'json_schema',strict:true}}});
  const input=JSON.parse((payloads[2].input as {content:string}[])[1].content);
  expect(input.employeeRequest).toContain('Mike');expect(input.evidence).toHaveLength(1);expect(input.evidence[0]).toMatchObject({callId:'journey',result:{artifacts:expect.arrayContaining([expect.objectContaining({type:'briefing',id:'investor-mike'})])}});
  expect(JSON.stringify(payloads[3].input)).toContain('specialist_review');expect(JSON.stringify(payloads[3].input)).not.toContain('You are the investor-relationship specialist');
  expect(getConversation(actor(),original.conversation.id).messages.at(-1)?.content).toBe(final);
  expect(assignment()).toMatchObject({status:'completed',budget:{maximumCents:512,spentCents:12,reservedCents:0}});expect(assignment().parts).toHaveLength(1);expect(assignment().attempts).toHaveLength(4);
  expect(getAssignmentBinding(actor(),{kind:'turn',id:original.requestId})).toEqual(root);expect(listAssignmentReviews(actor())).toHaveLength(1);
  expect(consultations()).toHaveLength(1);expect(JSON.parse(consultations()[0].result).data).toMatchObject({actionExecuted:false,assessment:assessment()});
  const operations=getDb().prepare('SELECT data FROM provider_operations ORDER BY rowid').all() as {data:string}[];expect(operations.map(r=>JSON.parse(r.data).feature)).toEqual(['core','core','investor-relationship','core']);
  expect(await processApprovedTextRequests(actor())).toBe(0);expect(fetcher).toHaveBeenCalledTimes(8);
 });
 it('does not dispatch counting, master or specialist requests after denial',async()=>{const {fetcher}=transport();await start();decideAssignmentReview(actor(),review().id,{...decision(),decision:'deny'});expect(await processApprovedTextRequests(actor())).toBe(0);expect(fetcher).not.toHaveBeenCalled();expect(assignment().budget.spentCents).toBe(0);});
 it('runs an inexpensive whole request inline without a needless decision',async()=>{tariff(1000);const {payloads}=transport();const result=await start();expect(result.result.message).toBe(final);expect(payloads).toHaveLength(4);expect(assignment().budget.maximumCents).toBeLessThanOrEqual(100);expect(consultations()).toHaveLength(1);});
 it('reuses the exact saved specialist receipt instead of charging another review',async()=>{
  const args={question:'  What should be done next?  ',evidenceCallIds:['journey'],specialistId:'investor-relationship'};
  const c=call('consult_specialist',args,'consult');const {payloads}=transport([[journey()],[c],[message(JSON.stringify(assessment()))],[c],[message(final)]]);
  await start();approve();await processApprovedTextRequests(actor());expect(consultations()).toHaveLength(1);expect(payloads.filter(p=>'text' in p)).toHaveLength(1);expect(assignment().budget.spentCents).toBe(15);expect(assignment().status).toBe('completed');
 });
 it('keeps a final master round available rather than expanding the approved allowance',async()=>{
  vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','3');const {payloads}=transport([[journey()],[consult()],[message('The remaining allowance cannot fit that review.')]]);
  await start();approve();await processApprovedTextRequests(actor());expect(payloads).toHaveLength(3);expect(payloads.some(p=>'text' in p)).toBe(false);expect(JSON.stringify(payloads[2].input)).toContain('cannot fit another specialist review');expect(consultations()).toHaveLength(0);expect(assignment().budget.spentCents).toBe(9);
 });
 it('can queue two focused methods inside the existing bound without nesting',async()=>{
  const second=consult({...reviewArgs(['journey']),specialistId:'daily-coordinator'},'second');
  const {payloads}=transport([[journey()],[consult(),second],[message(JSON.stringify(assessment()))],[message(JSON.stringify(assessment()))],[message(final)]]);
  await start();approve();await processApprovedTextRequests(actor());expect(payloads).toHaveLength(5);expect(payloads.filter(p=>'text' in p)).toHaveLength(2);expect(consultations()).toHaveLength(2);expect(assignment().budget.spentCents).toBe(15);
 });
 it.each([
  ['fabricated evidence',reviewArgs(['invented']), 'Retrieve current business evidence'],
  ['unavailable role',{...reviewArgs(),specialistId:'acquisition-lead'}, 'role'],
  ['caller price',{...reviewArgs(),maximumCents:0}, 'Tool input was invalid'],
 ])('rejects %s before a specialist request',async(_label,args,error)=>{
  const {payloads}=transport([[journey()],[call('consult_specialist',args,'bad')],[message('Review could not proceed.')]]);
  await start();approve();await processApprovedTextRequests(actor());expect(payloads.filter(p=>'text' in p)).toHaveLength(0);expect(JSON.stringify(payloads[2].input)).toContain(error);expect(consultations()).toHaveLength(0);
 });
 it('does not treat another request’s saved receipt as current evidence',async()=>{
  const first=transport([[journey()],[message('Journey read.')]]);const initial=await start();approve();await processApprovedTextRequests(actor());expect(first.payloads).toHaveLength(2);
  const next=transport([[consult()],[message('Retrieve current evidence first.')]]);await start(initial.conversation.id);approve();await processApprovedTextRequests(actor());expect(next.payloads.some(p=>'text' in p)).toBe(false);expect(consultations()).toHaveLength(0);
 });
 it('requires refreshed evidence after a local action changed the workspace',async()=>{
  const task=call('create_task',{title:'New fact after the lookup',dueAt:null,investorId:null});
  const {payloads}=transport([[journey()],[task],[consult()],[message('Please retrieve the journey again.')]]);
  await start(undefined,'Review Mike’s journey. Create a task titled New fact after the lookup, then ask a specialist for next steps.');approve();await processApprovedTextRequests(actor());expect(listTasks(actor()).some(t=>t.title==='New fact after the lookup')).toBe(true);expect(payloads.some(p=>'text' in p)).toBe(false);expect(JSON.stringify(payloads.at(-1)?.input)).toContain('workspace changed after this evidence');expect(consultations()).toHaveLength(0);
 });
 it.each([
  ['malformed assessment',[message('unstructured claims')]],
  ['invented citation',[message(JSON.stringify(assessment(['not-supplied'])))]],
  ['attempted action',[call('create_task',{title:'Unauthorized child action',dueAt:null,investorId:null})]],
 ])('withholds %s while retaining the actual charge',async(_label,output)=>{
  const {payloads}=transport([[journey()],[consult()],output]);await start();approve();await processApprovedTextRequests(actor());expect(payloads).toHaveLength(3);expect(assignment()).toMatchObject({status:'canceled',budget:{spentCents:9,reservedCents:0}});expect(consultations()).toHaveLength(0);expect(listTasks(actor()).some(t=>t.title==='Unauthorized child action')).toBe(false);expect(await processApprovedTextRequests(actor())).toBe(0);
 });
 it('persists a paused specialist response and resumes it once after reopening storage',async()=>{
  directory=mkdtempSync(join(tmpdir(),'agentdesk-specialist-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.sqlite'));
  const {payloads}=transport(undefined,(n)=>{if(n===2)control('pause');});const original=await start();approve();await processApprovedTextRequests(actor());
  expect(saved(original.requestId).phase).toBe('received');expect(review()).toMatchObject({executionState:'paused',canContinue:true,spentCents:9});expect(consultations()).toHaveLength(0);closeDb();
  const next=control('continue');expect(next.canDecide).toBe(false);expect(await processApprovedTextRequests(actor())).toBe(1);expect(payloads).toHaveLength(4);expect(consultations()).toHaveLength(1);expect(assignment().budget.spentCents).toBe(12);expect(getConversation(actor(),original.conversation.id).messages.at(-1)?.content).toBe(final);
 });
 it('retires a paid paused assessment on revision, keeps its charge and applies new instructions',async()=>{
  const {payloads}=transport(undefined,(n)=>{if(n===2)control('pause');});const original=await start();approve();await processApprovedTextRequests(actor());
  const next=control('revise',review(),'Only explain which source information is missing.');expect(next).toMatchObject({canDecide:true,spentCents:9,maximumCents:521});expect(saved(original.requestId).data.specialistQueue).toEqual([]);expect(await processApprovedTextRequests(actor())).toBe(0);approve(next);await processApprovedTextRequests(actor());
  expect(payloads).toHaveLength(4);expect(JSON.stringify(payloads[3].input)).toContain('pending specialist assessment was retired');expect(JSON.stringify(payloads[3].input)).toContain('Only explain which source information is missing.');expect(JSON.stringify(payloads[3].input)).not.toContain('Fictional source data; no message was sent.');expect(consultations()).toHaveLength(0);expect(assignment().budget.spentCents).toBe(12);
 });
 it('settles a canceled in-flight assessment without publishing it or continuing the master',async()=>{
  const {payloads}=transport(undefined,n=>{if(n===2)cancelAssignmentReview(actor(),review().id,decision());});await start();approve();await processApprovedTextRequests(actor());expect(payloads).toHaveLength(3);expect(consultations()).toHaveLength(0);expect(assignment()).toMatchObject({status:'canceled',budget:{spentCents:9,reservedCents:0}});expect(await processApprovedTextRequests(actor())).toBe(0);
 });
 it('withholds the paid assessment when current source context changes during generation',async()=>{
  const {payloads}=transport(undefined,n=>{if(n===2)createTask(actor(),{title:'Context changed during review',dueAt:null,investorId:null});});await start();approve();await processApprovedTextRequests(actor());expect(payloads).toHaveLength(3);expect(consultations()).toHaveLength(0);expect(assignment().budget).toMatchObject({spentCents:9,reservedCents:0});
 });
 it('holds unknown specialist usage without retry, then reconciles the exact original dispatch',async()=>{
  const {payloads}=transport(undefined,n=>{if(n===2)throw new Error('Unknown specialist transport outcome');});const original=await start();approve();await processApprovedTextRequests(actor());expect(assignment()).toMatchObject({status:'reconciling',budget:{spentCents:6,reservedCents:506}});expect(await processApprovedTextRequests(actor())).toBe(0);expect(payloads).toHaveLength(3);
  const attempt=assignment().attempts.at(-1)!,evidence={requestHash:attempt.requestHash,source:'Verified isolated provider export',receipt:receipt([message(JSON.stringify(assessment()))])};
  const reconciled=reconcileStoppedTextUsage(actor(),original.requestId,evidence);expect(reconciled).toMatchObject({status:'canceled',budget:{spentCents:9,reservedCents:0}});expect(consultations()).toHaveLength(0);expect(await processApprovedTextRequests(actor())).toBe(0);expect(payloads).toHaveLength(3);
 });
 it.each(['sms','slack'] as const)('returns the reviewed answer to its original %s destination once',async provider=>{
  const account=`AC${'a'.repeat(32)}`,phone='+15555550102';
  for(const [name,value] of Object.entries({AGENTDESK_CHANNELS_ENABLED:'true',AGENTDESK_CHANNEL_SEND_ENABLED:'true',AGENTDESK_CHANNEL_PUBLIC_ORIGIN:'https://channels.example',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'fixture',TWILIO_PHONE_NUMBER:'+15555550101',SLACK_TRANSPORT:'http',SLACK_SIGNING_SECRET:'fixture',SLACK_TEAM_ID:'TTEST',SLACK_APP_ID:'ATEST',SLACK_BOT_TOKEN:'fixture'}))vi.stubEnv(name,value);
  if(provider==='sms')grantTrial(demoActor('manager'),{userId:actor().id,features:['sms']});
  const incoming=(text:string)=>acceptMessage({provider,accountId:provider==='sms'?account:'TTEST',externalId:provider==='sms'?phone:'UTEST',address:provider==='sms'?phone:'DTEST',eventId:key(),text});
  incoming(createPairing(actor(),provider).command);getDb().prepare('DELETE FROM messaging_outbox').run();const {payloads}=transport();incoming('Review Mike’s context and recommend a follow-up.');await processMessagingInbox();approve();await processApprovedTextRequests(actor());
  const conversation=getConversation(actor(),messagingConversation(actor())),link=messagingState(actor()).links.find(l=>l.provider===provider)!;expect(conversation.messages.at(-1)?.content).toBe(final);
  const outgoing=getDb().prepare('SELECT link_id FROM messaging_outbox WHERE reference_id=?').all(conversation.messages.at(-1)!.id);expect(outgoing).toEqual([{link_id:link.id}]);
  const send=vi.fn(async()=>({id:key(),status:'sent'}));await processMessagingOutbox(send);const sends=send.mock.calls.length;await processApprovedTextRequests(actor());await processMessagingOutbox(send);expect(send).toHaveBeenCalledTimes(sends);expect(payloads).toHaveLength(4);
 });
 it('does not offer paid specialist delegation in operational mode',async()=>{vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');const {payloads}=transport([[message('Direct answer.')]]);await start();expect((payloads[0].tools as {name:string}[]).some(t=>t.name==='consult_specialist')).toBe(false);expect(consultations()).toHaveLength(0);});
 it.each([['acquisitions','acquisition-lead'],['manager','team-performance']] as const)('uses the %s employee’s permitted method and private context',async(role,specialistId)=>{
  const owner=demoActor(role),args={...reviewArgs([]),specialistId};const {payloads}=transport([[consult(args)],[message(JSON.stringify(assessment([])))],[message('Identify the missing evidence before deciding.')] ]);
  const original=await chat(owner,'Explain what information would help with my next work decision.',undefined,key()),r=listAssignmentReviews(owner)[0];decideAssignmentReview(owner,r.id,{...decision(r),decision:'approve'});await processApprovedTextRequests(owner);
  expect(payloads).toHaveLength(3);expect(JSON.stringify(payloads[1].input)).toContain(`You are the ${specialistId} specialist`);expect(JSON.parse((payloads[1].input as {content:string}[])[1].content).evidence).toEqual([]);
  expect(getConversation(owner,original.conversation.id).messages.at(-1)?.content).toBe('Identify the missing evidence before deciding.');expect(()=>getConversation(actor(),original.conversation.id)).toThrow();
 });
 it('will not use earlier specialist opinion as fresh business evidence',async()=>{
  vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','6');const {payloads}=transport([[journey()],[consult()],[message(JSON.stringify(assessment()))],[consult(reviewArgs(['consult']),'nested')],[message('Retrieve underlying business evidence first.')]]);
  await start();approve();await processApprovedTextRequests(actor());expect(payloads.filter(p=>'text' in p)).toHaveLength(1);expect(JSON.stringify(payloads.at(-1)?.input)).toContain('Earlier specialist advice is not source evidence');expect(consultations()).toHaveLength(1);
 });
 it('does not dispatch a review prepared alongside a context-changing action',async()=>{
  const task=call('create_task',{title:'Change during tool batch',dueAt:null,investorId:null});const {payloads}=transport([[journey()],[consult(),task],[message('Read the changed workspace before specialist review.')]]);
  await start(undefined,'Review Mike. Create a task titled Change during tool batch and ask a specialist for next steps.');approve();await processApprovedTextRequests(actor());expect(listTasks(actor()).some(t=>t.title==='Change during tool batch')).toBe(true);expect(payloads.some(p=>'text' in p)).toBe(false);expect(JSON.stringify(payloads.at(-1)?.input)).toContain('workspace changed while preparing this specialist review');expect(consultations()).toHaveLength(0);
 });
 it('commits the specialist receipt and next-round state together, with explicit recovery after storage failure',async()=>{
  const {payloads}=transport();const original=await start();approve();getDb().exec("CREATE TEMP TRIGGER interrupt_specialist BEFORE UPDATE ON text_executions WHEN OLD.phase='received' AND NEW.phase='ready' AND json_array_length(json_extract(OLD.data,'$.specialistQueue'))>0 BEGIN SELECT RAISE(ABORT,'interrupted specialist checkpoint'); END");
  await processApprovedTextRequests(actor());expect(saved(original.requestId).phase).toBe('received');expect(consultations()).toHaveLength(0);expect(assignment().budget.spentCents).toBe(9);expect(await processApprovedTextRequests(actor())).toBe(0);
  getDb().exec('DROP TRIGGER interrupt_specialist');control('pause');control('continue');await processApprovedTextRequests(actor());expect(payloads).toHaveLength(4);expect(consultations()).toHaveLength(1);expect(assignment().budget.spentCents).toBe(12);
 });
 it('finishes the queued review and synthesis when the tool-call limit is reached',async()=>{
  vi.stubEnv('AGENTDESK_TEXT_MAX_TOOL_CALLS','2');const {payloads}=transport();const original=await start();approve();await processApprovedTextRequests(actor());expect(payloads).toHaveLength(4);expect(payloads[3].tools).toEqual([]);expect(getConversation(actor(),original.conversation.id).messages.at(-1)?.content).toBe(final);expect(consultations()).toHaveLength(1);
 });
});
