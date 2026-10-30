import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Explicit opt-in: one live AI turn, then deterministic follow-through on fictional records.
if(!process.argv.includes('--live'))throw new Error('Use --live for this bounded, billable AI rehearsal.');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(!process.env.OPENAI_API_KEY)throw new Error('A configured OpenAI key is required.');
const directory=mkdtempSync(join(tmpdir(),'agentdesk-conversation-live-'));
Object.assign(process.env,{AGENTDESK_DB_PATH:join(directory,'rehearsal.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_TEXT_MAX_ROUNDS:'3',AGENTDESK_TEXT_MAX_TOOL_CALLS:'3',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'3000',AGENTDESK_TEXT_TIMEOUT_MS:'60000',OPENAI_REASONING_EFFORT:'low'});
const {closeDb,demoActor}=await import('../src/server/db');
const {prepareDemoScenario}=await import('../src/server/demo-scenario');
const {chat}=await import('../src/server/orchestrator');
const {messagingConversation}=await import('../src/server/messaging');
const {getPersonalTask,listPersonalTasks}=await import('../src/server/task-actions');
const {providerOperations}=await import('../src/server/provider-runtime');
const report:Record<string,unknown>={createdAt:new Date().toISOString(),synthetic:true,description:'Live task creation followed by typed reschedule, snooze, completion and replay. No external messaging.'};
try{
 prepareDemoScenario();const actor=demoActor(),conversationId=messagingConversation(actor);
 const dueAt=new Date(Date.now()+86400000).toISOString();
 const before=new Set(listPersonalTasks(actor).map(task=>task.id));
 const created=await chat(actor,`Create a personal reminder titled "Review Mike Bennett repair breakdown" for ${dueAt}. Link it to Mike Bennett.`,conversationId,'rehearsal-create');
 report.creation=created.result;
 const tasks=listPersonalTasks(actor).filter(task=>!before.has(task.id));assert.equal(tasks.length,1);
 const task=tasks[0];assert.equal(task.investorId,'investor-mike');assert.equal(task.dueAt,dueAt);
 const requests=providerOperations(actor).length;assert.ok(requests>0);
 const moved=await chat(actor,'Move it to tomorrow at 9am',conversationId,'rehearsal-move');
 assert.match(moved.result.message,/moved/i);assert.equal(getPersonalTask(actor,task.id).version,2);
 const snoozed=await chat(actor,'Snooze it for two hours',conversationId,'rehearsal-snooze');
 assert.match(snoozed.result.message,/snoozed/i);assert.equal(getPersonalTask(actor,task.id).version,3);
 const completed=await chat(actor,'Done',conversationId,'rehearsal-done');
 const replay=await chat(actor,'Done',conversationId,'rehearsal-done');
 assert.equal(replay.conversation.messages.length,completed.conversation.messages.length);
 assert.equal(getPersonalTask(actor,task.id).status,'completed');assert.equal(getPersonalTask(actor,task.id).version,4);
 assert.equal(providerOperations(actor).length,requests);
 assert.ok(providerOperations(actor).every(receipt=>receipt.status==='succeeded'));
 report.followThrough=[moved.result,snoozed.result,completed.result];report.finalTask=getPersonalTask(actor,task.id);
 report.receipts=providerOperations(actor).map(({operationId,model,status,usage,errorCode})=>({operationId,model,status,usage,errorCode}));
 report.completed=true;
 console.info(`PASS: live creation used ${requests} successful provider requests; reschedule, snooze, done and replay needed no further model requests.`);
}finally{
 mkdirSync('artifacts/conversation',{recursive:true});writeFileSync('artifacts/conversation/live-rehearsal.json',JSON.stringify(report,null,2));
 closeDb();rmSync(directory,{recursive:true,force:true});
}
