import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync,closeSync,constants,copyFileSync,existsSync,fsyncSync,mkdtempSync,openSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {defaultEvaluationRoot,executeToolRehearsalRequest,finishToolRehearsal,inspectToolRehearsal,prepareToolRehearsal,type EvaluationTransport,type ToolRehearsalScenario} from '../evaluations/specialists/runner';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {prepareDemoScenario} from '../src/server/demo-scenario';
import {assistantInstructions,chat,currentTextContext,currentTextScope} from '../src/server/orchestrator';
import {getOpportunityBoard} from '../src/server/opportunities';
import {createConversation} from '../src/server/services';
import {providerOperations} from '../src/server/provider-runtime';
import {usageBalances} from '../src/server/metering';

// This operator-only rehearsal uses newly seeded fictional persistence. It never
// opens an existing application DB, changes hosted allowances, or runs a worker.
const runtimeSettings={
 AGENTDESK_AUTH_MODE:'demo',AGENTDESK_DATA_MODE:'demo',AGENTDESK_STORAGE:'sqlite',AGENTDESK_INSTANCE_COUNT:'1',
 AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_HOSTED_DEMO:'false',
 AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_RESEARCH_PROVIDER:'synthetic-fixtures-v1',
 OPENAI_MODEL:'gpt-6.1-sol',OPENAI_REASONING_EFFORT:'high',AGENTDESK_TEXT_SPENDING_MODE:'operational',
 AGENTDESK_TEXT_MAX_ROUNDS:'3',AGENTDESK_TEXT_MAX_TOOL_CALLS:'3',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'20000',
 AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'4096',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'180000',AGENTDESK_TEXT_TIMEOUT_MS:'90000',
} as const;
const allowedTools={
 dispositions:['search_crm','match_buyers','investor_journey','relationship_recommendation','qualification_review','pre_call_briefing','next_steps'],
 acquisitions:['opportunity_review','handoff_overview'],
 manager:['handoff_overview','team_overview'],
} as const;
const requiredTool={dispositions:'match_buyers',acquisitions:'opportunity_review',manager:'handoff_overview'} as const;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileDigest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const revision=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
function fail(message:string):never{throw new Error(message);}
const roles=['dispositions','acquisitions','manager'] as const;
const scenarioSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),role:z.enum(roles),request:z.string().min(1).max(12000),conversationId:z.string().min(1),requestId:z.string().min(1).max(150)}).strict();
const manifestSchema=z.object({version:z.literal(1),planHash:z.string().regex(/^[a-f0-9]{64}$/),applicationRevision:z.string().regex(/^[a-f0-9]{40}$/),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),fixtureHash:z.string().regex(/^[a-f0-9]{64}$/),databaseHash:z.string().regex(/^[a-f0-9]{64}$/),runtimeHash:z.string().regex(/^[a-f0-9]{64}$/),scenarios:z.array(scenarioSchema).length(3)}).strict();
type Manifest=z.infer<typeof manifestSchema>;
type Snapshot=Record<string,unknown[]>;

function directoryFor(root:string,name:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(name))fail('Choose a simple new rehearsal name.');
 return join(resolve(root),name);
}
function privateJson(path:string,value:unknown,exclusive=false){
 const temporary=exclusive?path:`${path}.${randomUUID()}.tmp`,fd=openSync(temporary,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 if(!exclusive)renameSync(temporary,path);
}
function readJson(path:string):unknown{try{return JSON.parse(readFileSync(path,'utf8'));}catch{fail('Saved rehearsal evidence is missing or unreadable. No automatic retry is available.');}}
function sourceHash(){
 const paths:string[]=[];
 function scan(path:string){for(const entry of readdirSync(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())scan(child);else if(entry.isFile())paths.push(child);}}
 scan('src/server');scan('src/lib');paths.push('scripts/model-tool-rehearsal.ts','package.json','package-lock.json');
 return digest(paths.sort().map(path=>[path,fileDigest(path)]));
}
function snapshot():Snapshot{
 const tables=getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[];
 return Object.fromEntries(tables.map(({name})=>{
  if(!/^[a-zA-Z0-9_]+$/.test(name))fail('Unexpected fixture table name.');
  return [name,getDb().prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()];
 }));
}
function protectedSnapshot(value:Snapshot){
 const tables=['investors','properties','tasks','proposed_actions','research_jobs','property_releases','deal_packages',
 'acquisition_opportunities','acquisition_opportunity_events','handoff_coordination','handoff_events','opportunity_handoff_coordination','opportunity_handoff_events',
 'role_preparations','role_preparation_decisions','communication_threads','communication_messages','communication_drafts','communication_draft_revisions','communication_events',
 'messaging_inbox','messaging_outbox','capability_connections','connection_sync_batches','connection_sync_records','billing_credit_grants','billing_trials','wallet_operations','wallet_ledger'];
 return Object.fromEntries(tables.filter(table=>table in value).map(table=>[table,value[table]]));
}
async function isolated<T>(databasePath:string,key:string,work:()=>Promise<T>):Promise<T>{
 const settings:Record<string,string>={...runtimeSettings,AGENTDESK_DB_PATH:databasePath,DATABASE_PATH:databasePath,OPENAI_API_KEY:key};
 const original=Object.fromEntries(Object.keys(settings).map(name=>[name,process.env[name]]));
 closeDb();Object.assign(process.env,settings);
 try{return await work();}finally{closeDb();for(const [name,value] of Object.entries(original)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
}

/** No network or credential loading. Normal demo trials exist only in this new fixture. */
export async function prepareActualToolRehearsal(root:string,name:string){
 const directory=directoryFor(root,name);if(existsSync(directory))fail('This rehearsal already exists and cannot be replaced.');
 const temporary=mkdtempSync(join(tmpdir(),'agentdesk-sol-tools-'));
 try{
  const databasePath=join(temporary,'fixture.sqlite');
  const frozen=await isolated(databasePath,'',async()=>{
   prepareDemoScenario();
   const opportunity=getOpportunityBoard(demoActor('acquisitions')).items.find(item=>item.address==='456 Preview Lane');
   if(!opportunity)fail('The normal fictional opportunity fixture is unavailable.');
   const requests={
    dispositions:'Using current saved records, who best fits 123 Example Street, and what relationship concern should I address next? Keep this read-only: no new research, drafts, tasks or messages.',
    acquisitions:`Review the current fictional 456 Preview Lane opportunity (${opportunity.id}). What is blocking it, and what should Jordan ask the wholesaler first? Keep this read-only; do not prepare or apply changes.`,
    manager:'Review office shared handoffs. Which needs attention first, who owns its next step, and what still requires manager resolution? Keep this read-only; do not prepare or apply changes.',
   };
   const cases=roles.map(role=>{
    const actor=demoActor(role),conversation=createConversation(actor,`Fictional Sol tool rehearsal · ${role}`);
    // Materialize normal first-read demo sources before freezing the initial DB.
    currentTextContext(actor,conversation.id);currentTextScope(actor,conversation.id);assistantInstructions(actor);
    return {role,request:requests[role],conversationId:conversation.id};
   });
   const material=snapshot();getDb().pragma('wal_checkpoint(TRUNCATE)');
   return {cases,material};
  });
  const fixtureHash=digest(frozen.material),scenarios=frozen.cases.map(value=>({...value,id:`${value.role}-${fixtureHash.slice(0,48)}`,requestId:`tool-rehearsal-${value.role}-${fixtureHash.slice(0,48)}`}));
  const applicationRevision=revision();
  const prepared=prepareToolRehearsal(root,name,applicationRevision,scenarios.map(({id,role,request})=>({id,role,request})));
  copyFileSync(databasePath,join(directory,'fixture.sqlite'),constants.COPYFILE_EXCL);chmodSync(join(directory,'fixture.sqlite'),0o600);
  privateJson(join(directory,'fixture-material.json'),frozen.material,true);
  const manifest:Manifest={version:1,planHash:prepared.planHash,applicationRevision,sourceHash:sourceHash(),fixtureHash,databaseHash:fileDigest(join(directory,'fixture.sqlite')),runtimeHash:digest(runtimeSettings),scenarios};
  privateJson(join(directory,'fixture-manifest.json'),manifest,true);
  return {...prepared,fixtureHash,notice:'Fresh fictional fixture with ordinary demo trial setup. No existing account, hosted allowance, provider setting or payment changed. No model request made.'};
 }finally{rmSync(temporary,{recursive:true,force:true});}
}

function readManifest(root:string,name:string){
 const directory=directoryFor(root,name),manifest=manifestSchema.parse(readJson(join(directory,'fixture-manifest.json'))),plan=inspectToolRehearsal(root,name);
 const frozenPlan=z.object({scenarios:z.array(z.object({id:z.string(),role:z.enum(roles),request:z.string()}))}).passthrough().parse(readJson(join(directory,'plan.json')));
 if(plan.planHash!==manifest.planHash||digest(frozenPlan.scenarios)!==digest(manifest.scenarios.map(({id,role,request})=>({id,role,request})))||new Set(manifest.scenarios.map(s=>s.role)).size!==3)fail('The fixture scenarios differ from the frozen provider plan.');
 if(manifest.scenarios.some(s=>s.id!==`${s.role}-${manifest.fixtureHash.slice(0,48)}`||s.requestId!==`tool-rehearsal-${s.role}-${manifest.fixtureHash.slice(0,48)}`))fail('The scenario identities no longer bind their original fixture.');
 if(fileDigest(join(directory,'fixture.sqlite'))!==manifest.databaseHash||digest(readJson(join(directory,'fixture-material.json')))!==manifest.fixtureHash)fail('The immutable fixture changed. No model request was made.');
 return {directory,manifest,plan};
}
export function inspectActualToolRehearsal(root:string,name:string){
 const {directory,manifest,plan}=readManifest(root,name);
 return {...plan,fixtureHash:manifest.fixtureHash,execution:existsSync(join(directory,'execution.json'))?readJson(join(directory,'execution.json')):null};
}

/** Captures fetch before installing the app wrapper, preventing counting recursion. */
export function actualRehearsalTransport(key:string,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)):EvaluationTransport{
 const request=async(path:'responses'|'responses/input_tokens',body:string,requestId?:string)=>{
  const response=await fetcher(`https://api.openai.com/v1/${path}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(requestId?{'X-Client-Request-Id':requestId}:{})},body,signal:AbortSignal.timeout(90000)});
  return {status:response.status,body:await response.text(),requestId:response.headers.get('x-request-id')??undefined};
 };
 return {count:body=>request('responses/input_tokens',body),create:(body,id)=>request('responses',body,id)};
}

export async function runActualToolRehearsal(root:string,name:string,approval:{planHash:string;maximumCents:number},transport:EvaluationTransport){
 const {directory,manifest,plan}=readManifest(root,name);
 if(approval.planHash!==manifest.planHash||approval.maximumCents!==999)fail('Use the exact frozen plan hash and the existing shared 999-cent campaign authorization.');
 if(revision()!==manifest.applicationRevision||sourceHash()!==manifest.sourceHash||digest(runtimeSettings)!==manifest.runtimeHash)fail('Application source or rehearsal configuration changed after preparation. No model request was made.');
 if(plan.status!=='prepared'||plan.attemptedCalls!==0)fail('This rehearsal has already started. Inspect its saved evidence; it cannot be restarted.');
 const key=process.env.OPENAI_API_KEY;if(!key?.trim())fail('The existing server credential is unavailable. No provider call was made.');
 // Exclusive creation prevents a second script from copying/resetting the same fixture.
 privateJson(join(directory,'execution.json'),{status:'running',planHash:manifest.planHash,startedAt:new Date().toISOString(),scenariosCompleted:0},true);
 const databasePath=join(directory,'working.sqlite');copyFileSync(join(directory,'fixture.sqlite'),databasePath,constants.COPYFILE_EXCL);chmodSync(databasePath,0o600);
 const originalFetch=globalThis.fetch,results:unknown[]=[];let active:ToolRehearsalScenario|undefined,appFetches=0,stage='initial_fixture';
 const evidence:Record<string,unknown>={version:1,planHash:manifest.planHash,fixtureHash:manifest.fixtureHash,model:'gpt-6.1-sol',reasoning:'high',maxOutputTokens:4096,synthetic:true,kind:'actual_application_tool_rehearsal',limitations:'Three bounded read-only chats using local Sol/high/4096, distinct from the observed hosted Astra/low/3000 settings. This is engineering tool evidence, not a comparative quality result or consult_specialist acceptance.',results};
 try{
  return await isolated(databasePath,key,async()=>{
   getDb({initialize:false});
   if(digest(snapshot())!==manifest.fixtureHash)fail('The copied initial database differs from the serialized fixture. No model request was made.');
   const before=protectedSnapshot(snapshot());
   globalThis.fetch=async(input,options)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(url!=='https://api.openai.com/v1/responses'||options?.method!=='POST'||typeof options.body!=='string'||!active)fail('The rehearsal blocked an external destination or request outside its selected scenario.');
    const requestId=new Headers(options.headers).get('X-Client-Request-Id');if(!requestId)fail('The app request lacks its original durable identity.');
    appFetches++;
    const raw=await executeToolRehearsalRequest(root,name,approval,{scenarioId:active.id,requestId,body:options.body},transport);
    const calls=z.array(z.record(z.string(),z.unknown())).parse(raw.output).filter(item=>item.type==='function_call');
    const allowed:readonly string[]=allowedTools[active.role];
    if(calls.some(call=>typeof call.name!=='string'||!allowed.includes(call.name)))fail('The model selected a tool outside the reviewed read-only scenario. Its paid receipt is retained; no returned tool was executed.');
    return new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
   };
   try{
    for(const scenario of manifest.scenarios){
     active=scenario;const actor=demoActor(scenario.role),startFetches=appFetches;
     stage=`${scenario.role}:chat`;
     const result=await chat(actor,scenario.request,scenario.conversationId,scenario.requestId);
     const receipts=getDb().prepare('SELECT call_id,result FROM assistant_tool_receipts WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? ORDER BY rowid').all(actor.organizationId,actor.officeId,actor.id,scenario.conversationId) as {call_id:string;result:string}[];
     const operations=providerOperations(actor),execution=getDb().prepare('SELECT phase,data FROM text_executions WHERE request_id=?').get(scenario.requestId) as {phase:string;data:string}|undefined;
     const replayBefore=appFetches,replay=await chat(actor,scenario.request,scenario.conversationId,scenario.requestId);
     const replayVerified=appFetches===replayBefore&&digest(replay)===digest(result);
     const parsedReceipts=receipts.map(receipt=>({callId:receipt.call_id,result:JSON.parse(receipt.result) as Record<string,unknown>}));
     const successfulTools=parsedReceipts.filter(receipt=>receipt.result.completed!==false&&!receipt.result.error);
     // Receipt rows store results, while durable response items retain exact tool names.
     const state=execution?JSON.parse(execution.data) as {items?:Record<string,unknown>[]}:{},toolNames=(state.items??[]).filter(item=>item.type==='function_call').map(item=>item.name);
     const entry={scenarioId:scenario.id,role:scenario.role,request:scenario.request,response:result.result,conversation:result.conversation,toolNames,toolReceipts:parsedReceipts,providerOperations:operations,usageBalances:usageBalances(actor),replayVerified,modelCalls:appFetches-startFetches,executionPhase:execution?.phase};
     results.push(entry);privateJson(join(directory,'tool-evidence.json'),evidence);
     stage=`${scenario.role}:exact_replay`;
     assert.equal(replayVerified,true,'Exact request replay must not call the provider or change the saved answer.');
     stage=`${scenario.role}:completed_execution`;
     assert.equal(execution?.phase,'completed','The ordinary application text execution did not complete.');
     stage=`${scenario.role}:provider_receipts`;
     assert.ok(operations.length>=1&&operations.length<=3&&operations.every(item=>item.status==='succeeded'&&item.model==='gpt-6.1-sol'),'Every actual app request needs a successful Sol receipt.');
     stage=`${scenario.role}:required_tool`;
     assert.ok(toolNames.includes(requiredTool[scenario.role]),'The model did not retrieve the required current role source.');
     stage=`${scenario.role}:tool_results`;
     assert.ok(successfulTools.length>=1&&successfulTools.length===receipts.length,'A required actual application tool failed.');
     stage=`${scenario.role}:unchanged_business_records`;
     assert.deepEqual(protectedSnapshot(snapshot()),before,'The read-only rehearsal changed a protected business record, allowance grant, research job or delivery record.');
     privateJson(join(directory,'execution.json'),{status:'running',planHash:manifest.planHash,scenariosCompleted:results.length});
    }
    stage='finish';const finished=finishToolRehearsal(root,name,manifest.planHash);
    evidence.completed=true;privateJson(join(directory,'tool-evidence.json'),evidence);
    privateJson(join(directory,'execution.json'),{status:'completed',planHash:manifest.planHash,scenariosCompleted:results.length,finishedAt:new Date().toISOString()});
    return {...finished,verifiedScenarios:results.length,evidenceFile:join(directory,'tool-evidence.json'),notice:'Actual local application tools and replay verified on fictional data. No external research, message delivery, hosted mutation or specialist-consultation certification.'};
   }finally{globalThis.fetch=originalFetch;getDb().pragma('wal_checkpoint(TRUNCATE)');}
  });
 }catch{
  evidence.completed=false;evidence.stoppedAt=stage;privateJson(join(directory,'tool-evidence.json'),evidence);
  privateJson(join(directory,'execution.json'),{status:'stopped',planHash:manifest.planHash,scenariosCompleted:results.length,stoppedAt:stage,finishedAt:new Date().toISOString(),reason:'The bounded rehearsal stopped. Inspect provider ledger and tool evidence; no automatic retry is available.'});
  throw new Error('The bounded tool rehearsal stopped. Its saved evidence and any usage holds remain; no automatic retry was made.');
 }finally{globalThis.fetch=originalFetch;}
}

async function main(){
 const [command,name,...args]=process.argv.slice(2),root=defaultEvaluationRoot();
 if(!name)fail('Use prepare <new-name>, inspect <name>, or run <name> --approve-plan <hash> --maximum-cents 999.');
 if(command==='prepare'&&!args.length)return prepareActualToolRehearsal(root,name);
 if(command==='inspect'&&!args.length)return inspectActualToolRehearsal(root,name);
 if(command!=='run'||args.length!==4||args[0]!=='--approve-plan'||!/^[a-f0-9]{64}$/.test(args[1])||args[2]!=='--maximum-cents'||args[3]!=='999')fail('Run requires the exact frozen plan hash and --maximum-cents 999.');
 // Never print, persist in evidence, or pass credentials to the model.
 if(existsSync('.env.local'))process.loadEnvFile('.env.local');
 const key=process.env.OPENAI_API_KEY;if(!key?.trim())fail('The existing server credential is unavailable. No provider call was made.');
 return runActualToolRehearsal(root,name,{planHash:args[1],maximumCents:999},actualRehearsalTransport(key));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.info(JSON.stringify(await main(),null,2));}catch{console.error('Tool rehearsal stopped. Inspect its saved manifest, execution state and campaign ledger. No automatic provider retry was made.');process.exitCode=1;}
}
