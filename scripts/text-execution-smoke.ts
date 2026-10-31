import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {closeDb,demoActor,getDb,now} from '../src/server/db';
import {createConversation,createTask,listTasks} from '../src/server/services';
import {bindAssignment,withAssignment,currentAssignment} from '../src/server/assignment-roots';
import {fingerprint,providerOperations} from '../src/server/provider-runtime';
import {runLiveText} from '../src/server/text-runtime';

const stage=process.argv[2];
async function child(){
 if(process.env.AGENTDESK_TEXT_RESTART_ISOLATED!=='true'||!process.env.AGENTDESK_DB_PATH||!process.env.AGENTDESK_TEXT_RESTART_STATE)throw new Error('This child requires its disposable restart fixture.');
 const actor=demoActor(),requestId='text-process-restart',host={kind:'turn' as const,id:requestId},stateFile=process.env.AGENTDESK_TEXT_RESTART_STATE;
 let saved:{conversationId:string;rootId:string};
 if(stage==='interrupt'){
  const conversation=createConversation(actor,'Fictional process restart');
  getDb().prepare('INSERT INTO assistant_turns VALUES(?,?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,requestId,conversation.id,fingerprint({fictional:requestId}),'running',now(),null);
  const root=bindAssignment(actor,host);saved={conversationId:conversation.id,rootId:root.rootId};writeFileSync(stateFile,JSON.stringify(saved));
  getDb().exec("CREATE TEMP TRIGGER simulated_checkpoint_crash BEFORE UPDATE ON text_executions WHEN NEW.phase='ready' BEGIN SELECT RAISE(ABORT,'simulated_process_stop'); END;");
 }else saved=JSON.parse(readFileSync(stateFile,'utf8'));
 let requests=0;
 globalThis.fetch=async()=>{
  requests++;
  const output=stage==='interrupt'?[{type:'function_call',status:'completed',name:'create_task',arguments:'{}',call_id:'restart-task'}]:[{type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:'Saved once after process restart.'}]}];
  return new Response(JSON.stringify({id:`fictional-response-${stage}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:40}}));
 };
 const scope=()=>({tasks:listTasks(actor).map(task=>task.id)});
 const execute=()=>withAssignment(actor,host,()=>runLiveText({actor,requestId,conversationId:saved.conversationId,message:'Save a fictional task',instructions:'Use the fictional task tool.',context:{fictional:true},scope:scope(),currentScope:scope,history:[],tools:[],artifacts:[],specialists:new Set(),dispatch:()=>{const task=createTask(actor,{title:'Process restart task',dueAt:null,investorId:null});return {message:'Task saved.',specialistIds:[],artifacts:[{type:'task',id:task.id,title:task.title}]};}}));
 if(stage==='interrupt'){
  await assert.rejects(execute(),/simulated_process_stop/);
  assert.equal((getDb().prepare('SELECT phase FROM text_executions').get() as {phase:string}).phase,'received');
  assert.equal(listTasks(actor).filter(task=>task.title==='Process restart task').length,0);
  assert.equal(providerOperations(actor).length,1);assert.equal(requests,1);
 }else{
  const result=await execute();assert.equal(result.message,'Saved once after process restart.');
  assert.equal(listTasks(actor).filter(task=>task.title==='Process restart task').length,1);
  assert.equal(providerOperations(actor).length,2);assert.equal(requests,1);
  assert.equal(withAssignment(actor,host,()=>currentAssignment(actor).rootId),saved.rootId);
  assert.deepEqual(await execute(),result);assert.equal(requests,1);
 }
 assert.equal(getDb().pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(getDb().pragma('foreign_key_check'),[]);closeDb();
}
if(stage){await child();}else{
 const directory=mkdtempSync(join(tmpdir(),'agentdesk-text-restart-'));
 try{
  const env={...process.env,AGENTDESK_DB_PATH:join(directory,'restart.sqlite'),AGENTDESK_TEXT_RESTART_STATE:join(directory,'fixture.json'),AGENTDESK_TEXT_RESTART_ISOLATED:'true',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'mock-key-never-sent',OPENAI_MODEL:'gpt-6-astra',OPENAI_REASONING_EFFORT:'high',AGENTDESK_TEXT_MAX_ROUNDS:'5',AGENTDESK_TEXT_MAX_TOOL_CALLS:'8',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'8000',AGENTDESK_TEXT_TIMEOUT_MS:'90000',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'180000'};
  for(const step of ['interrupt','resume']){const result=spawnSync(process.execPath,['--import','tsx','scripts/text-execution-smoke.ts',step],{env,encoding:'utf8'});assert.equal(result.status,0,`${step}: ${result.stderr}`);}
  console.info('PASS: text execution survived a real process restart; saved response reused, one task and two total model receipts, no duplicate request on replay. Mock transport only.');
 }finally{rmSync(directory,{recursive:true,force:true});}
}
