import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {getConversation} from '../src/server/services';
import {listAssignmentReviews,decideAssignmentReview} from '../src/server/assignment-reviews';
import {controlTextAssignment} from '../src/server/text-controls';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {getAssignmentBinding,withAssignment} from '../src/server/assignment-roots';
import {readTextExecution} from '../src/server/text-execution';
import {getMeteredAssignment} from '../src/server/metered-work';

const stage=process.argv[2],requestId='specialist-process-restart',final='The current specialist assessment is saved in the original conversation.';
async function child(){
 if(!['queue','receive','finish'].includes(stage)||process.env.AGENTDESK_SPECIALIST_RESTART_ISOLATED!=='true'||!process.env.AGENTDESK_DB_PATH||!process.env.AGENTDESK_SPECIALIST_RESTART_STATE)throw new Error('This child requires its disposable specialist fixture.');
 const actor=demoActor(),file=process.env.AGENTDESK_SPECIALIST_RESTART_STATE;
 let requests=0,counts=0;
 const review=()=>listAssignmentReviews(actor)[0];
 const control=(action:'pause'|'continue')=>{const r=review();return controlTextAssignment(actor,r.id,{quoteId:r.quoteId,revision:r.revision,eventKey:`${stage}-${action}`,action});};
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/input_tokens')){counts++;if(stage==='queue'&&counts===3)control('pause');return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40}));}
  requests++;const payload=JSON.parse(String(options?.body));let output:unknown[];
  if(stage==='queue'){
   assert.ok(requests<=2,'No specialist generation before the saved pause');
   output=[requests===1?{type:'function_call',name:'investor_journey',call_id:'journey',arguments:JSON.stringify({investorId:'investor-mike'})}:{type:'function_call',name:'consult_specialist',call_id:'consult',arguments:JSON.stringify({specialistId:'investor-relationship',question:'What should we clarify before following up?',evidenceCallIds:['journey']})}];
  }else if(stage==='receive'){
   assert.equal(requests,1);assert.deepEqual(payload.tools,[]);assert.equal(payload.text.format.name,'specialist_assessment');assert.equal(JSON.parse(payload.input[1].content).evidence[0].callId,'journey');control('pause');
   output=[{type:'message',content:[{type:'output_text',text:JSON.stringify({conclusion:'Resolve the reported uncertainty.',evidence:[{callId:'journey',observation:'Fictional employee-reported journey.'}],assumptions:[],missingInformation:['Current repair scope'],recommendedNextSteps:['Ask for repair details.'],limitations:['No verified fact or business action.']})}]}];
  }else{
   assert.equal(requests,1);assert.ok(!payload.text,'The saved specialist response must not be requested again');assert.ok(JSON.stringify(payload.input).includes('specialist_review'));
   output=[{type:'message',content:[{type:'output_text',text:final}]}];
  }
  return new Response(JSON.stringify({id:`fixture-${stage}-${requests}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:20,output_tokens:10}}));
 };
 if(stage==='queue'){
  const original=await chat(actor,'Review Mike’s journey and advise on the next follow-up.',undefined,requestId),r=review();assert.equal(requests,0);assert.equal(counts,0);
  const root=getAssignmentBinding(actor,{kind:'turn',id:requestId})!;writeFileSync(file,JSON.stringify({conversationId:original.conversation.id,rootId:root.rootId}));
  decideAssignmentReview(actor,r.id,{quoteId:r.quoteId,revision:r.revision,eventKey:'approve-fixture',decision:'approve'});
 }else{const continued=control('continue');assert.equal(continued.canDecide,false,'An explicit unchanged continuation retains its original decision');}
 assert.equal(await processApprovedTextRequests(actor),1);
 const state=withAssignment(actor,{kind:'turn',id:requestId},()=>readTextExecution(actor,requestId)!),saved=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(getAssignmentBinding(actor,{kind:'turn',id:requestId})!.rootId,saved.rootId);
 const assignment=getMeteredAssignment(actor,state.data.metering!.assignmentId);
 assert.equal(assignment.parts.length,1);assert.equal(assignment.budget.maximumCents,512);
 assert.equal(state.phase,stage==='queue'?'ready':stage==='receive'?'received':'completed');assert.equal(assignment.budget.spentCents,stage==='queue'?6:stage==='receive'?9:12);
 assert.equal((getDb().prepare("SELECT count(*) n FROM assistant_tool_receipts WHERE json_extract(result,'$.data.kind')='specialist_review'").get() as {n:number}).n,stage==='finish'?1:0);
 if(stage==='finish'){
  assert.equal(getConversation(actor,saved.conversationId).messages.filter(m=>m.content===final).length,1);assert.equal(assignment.attempts.length,4);assert.equal(assignment.budget.reservedCents,0);assert.equal(await processApprovedTextRequests(actor),0);assert.equal(requests,1);
 }
 assert.equal(getDb().pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(getDb().pragma('foreign_key_check'),[]);closeDb();
}
if(stage){await child();}else{
 const directory=mkdtempSync(join(tmpdir(),'agentdesk-specialist-restart-'));
 try{
  const env={...process.env,AGENTDESK_DB_PATH:join(directory,'restart.sqlite'),AGENTDESK_SPECIALIST_RESTART_STATE:join(directory,'fixture.json'),AGENTDESK_SPECIALIST_RESTART_ISOLATED:'true',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_MOBILE_PUSH_SEND_ENABLED:'false',OPENAI_API_KEY:'mock-key-never-sent',OPENAI_MODEL:'gpt-6-astra',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'5',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000',AGENTDESK_TEXT_CUSTOMER_TARIFFS:JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional specialist restart tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}])};
  for(const step of ['queue','receive','finish']){const result=spawnSync(process.execPath,['--import','tsx','scripts/specialist-review-smoke.ts',step],{env,encoding:'utf8'});assert.equal(result.status,0,`${step}: ${result.stderr}`);}
  console.info('PASS: queued and paid specialist reviews survived separate process restarts; one root/allowance, four model receipts, one saved assessment and final answer. Fictional data and transport only.');
 }finally{rmSync(directory,{recursive:true,force:true});}
}
