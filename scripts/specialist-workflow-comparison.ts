import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync,closeSync,constants,copyFileSync,existsSync,fsyncSync,mkdtempSync,openSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {closeWorkflowAfterCountLimit,defaultEvaluationRoot,executeWorkflowComparisonRequest,finishWorkflowComparison,inspectWorkflowComparison,prepareWorkflowCapacityConfirmation,prepareWorkflowCapacityFollowup,prepareWorkflowComparison,recordWorkflowComparisonOutcome,type EvaluationTransport,type WorkflowComparisonSlot} from '../evaluations/specialists/runner';
import {workflowAllowedTools,workflowArms,workflowBusinessSnapshot,workflowCaseVersion,workflowDigest,workflowFinish,workflowFixture,workflowIntervene,workflowRequests,workflowRoles,workflowRubric,workflowStart} from '../evaluations/specialists/workflow-cases';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {prepareDemoScenario} from '../src/server/demo-scenario';
import {assistantInstructions,chat,currentTextContext,currentTextScope} from '../src/server/orchestrator';
import {createConversation} from '../src/server/services';
import {withSpecialistGuidanceEvaluation} from '../src/server/specialist-guidance-evaluation';
import {actualRehearsalTransport} from './model-tool-rehearsal';

const runtime={AGENTDESK_AUTH_MODE:'demo',AGENTDESK_DATA_MODE:'demo',AGENTDESK_STORAGE:'sqlite',AGENTDESK_INSTANCE_COUNT:'1',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_HOSTED_DEMO:'false',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_RESEARCH_PROVIDER:'synthetic-fixtures-v1',OPENAI_MODEL:'gpt-6.1-sol',OPENAI_REASONING_EFFORT:'high',AGENTDESK_TEXT_SPENDING_MODE:'operational',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'30000',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'4096',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'240000',AGENTDESK_TEXT_TIMEOUT_MS:'90000'} as const;
const caps={dispositions:4,acquisitions:3,manager:3} as const;
const followupRuntime={...runtime,AGENTDESK_TEXT_MAX_INPUT_TOKENS:'20000',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'180000'} as const;
const confirmationRuntime={...followupRuntime,AGENTDESK_TEXT_MAX_INPUT_TOKENS:'25000'} as const;
type WorkflowKind='workflow_comparison'|'workflow_capacity_followup'|'workflow_capacity_confirmation';
const settingsFor=(kind:WorkflowKind)=>kind==='workflow_capacity_confirmation'?{runtime:confirmationRuntime,caps:{dispositions:[5,5],manager:[3,5]},maxToolCalls:8}:kind==='workflow_capacity_followup'?{runtime:followupRuntime,caps:{dispositions:5,manager:5},maxToolCalls:8}:{runtime,caps};
const hashFile=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const revision=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
function committedSource(){const changes=execFileSync('git',['status','--porcelain','--','src/server','src/lib','scripts/specialist-workflow-comparison.ts','scripts/model-tool-rehearsal.ts','evaluations/specialists/workflow-cases.ts','evaluations/specialists/runner.ts','package.json','package-lock.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});assert.equal(changes.trim(),'','Commit the relevant application and evaluation source before freezing or running paid evidence.');}
function directoryFor(root:string,name:string){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(name))throw new Error('Use a new simple comparison name.');return join(resolve(root),name);}
function readJson(path:string):unknown{return JSON.parse(readFileSync(path,'utf8'));}
function privateJson(path:string,value:unknown,exclusive=false){const temporary=exclusive?path:`${path}.${randomUUID()}.tmp`,fd=openSync(temporary,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}if(!exclusive)renameSync(temporary,path);}
function sourceHash(){const files:string[]=[];function scan(path:string){for(const entry of readdirSync(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())scan(child);else if(entry.isFile())files.push(child);}}scan('src/server');scan('src/lib');files.push('scripts/specialist-workflow-comparison.ts','scripts/model-tool-rehearsal.ts','evaluations/specialists/workflow-cases.ts','evaluations/specialists/runner.ts','package.json','package-lock.json');return workflowDigest(files.sort().map(file=>[file,hashFile(file)]));}
function snapshot(){return Object.fromEntries((getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(({name})=>{assert.match(name,/^[a-zA-Z0-9_]+$/);return [name,getDb().prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()];}));}
async function isolated<T>(path:string,key:string,rounds:3|4|5,work:()=>Promise<T>,kind:WorkflowKind='workflow_comparison'):Promise<T>{
 const settings:Record<string,string>={...settingsFor(kind).runtime,AGENTDESK_DB_PATH:path,DATABASE_PATH:path,OPENAI_API_KEY:key,AGENTDESK_TEXT_MAX_ROUNDS:String(rounds),AGENTDESK_TEXT_MAX_TOOL_CALLS:String(kind==='workflow_comparison'?rounds:8)};
 const previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));closeDb();Object.assign(process.env,settings);
 try{return await work();}finally{closeDb();for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
const fixtureSchema=z.object({opportunityId:z.string(),reportedOn:z.string(),dueAt:z.string(),preparedAt:z.string()}).strict();
const slotSchema=z.object({id:z.string(),role:z.enum(workflowRoles),arm:z.enum(workflowArms),turn:z.union([z.literal(0),z.literal(1)]),conversationId:z.string(),employeeRequestId:z.string(),request:z.string(),maxCalls:z.union([z.literal(3),z.literal(4),z.literal(5)])}).strict();
const basisSchema=z.object({name:z.string(),planHash:z.string(),fixtureHash:z.string(),databaseHash:z.string()}).strict();
const manifestSchema=z.object({version:z.literal(1),kind:z.enum(['workflow_comparison','workflow_capacity_followup','workflow_capacity_confirmation']).default('workflow_comparison'),basis:basisSchema.optional(),after:z.object({name:z.string(),planHash:z.string(),closureHash:z.string()}).strict().optional(),planHash:z.string(),applicationRevision:z.string(),sourceHash:z.string(),runtimeHash:z.string(),fixtureHash:z.string(),databaseHash:z.string(),fixture:fixtureSchema,slots:z.array(slotSchema).min(8).max(12),rubric:z.unknown()}).strict();

/** Preparation is offline and only creates new fictional fixture copies. It requires the original shared campaign. */
export async function prepareActualWorkflowComparison(root:string,name:string){
 committedSource();
 const directory=directoryFor(root,name);assert.equal(existsSync(directory),false,'Evidence cannot be replaced.');
 // Never treat a missing original campaign as an unused budget.
 const campaign=z.object({id:z.string().uuid(),maximumCents:z.literal(999)}).passthrough().parse(readJson(join(resolve(root),'campaign.json')));
 const temporary=mkdtempSync(join(tmpdir(),'agentdesk-workflow-'));
 try{
  const database=join(temporary,'fixture.sqlite');
  const frozen=await isolated(database,'',4,async()=>{
   prepareDemoScenario();const fixture=workflowFixture(),requests=workflowRequests(fixture),slots:WorkflowComparisonSlot[]=[];
   for(const role of workflowRoles)for(const arm of workflowArms){const actor=demoActor(role),conversation=createConversation(actor,`Fictional workflow comparison ${role} ${arm}`);currentTextContext(actor,conversation.id);currentTextScope(actor,conversation.id);assistantInstructions(actor);for(const turn of [0,1] as const)slots.push({id:`${role}-${arm}-${turn}`,role,arm,turn,conversationId:conversation.id,employeeRequestId:`workflow-${role}-${arm}-${turn}-${randomUUID()}`,request:requests[role][turn],maxCalls:caps[role]});}
   const material=snapshot();getDb().pragma('wal_checkpoint(TRUNCATE)');return {fixture,slots,material};
  });
  const fixtureHash=workflowDigest({fixture:frozen.fixture,records:frozen.material}),applicationRevision=revision(),runtimeHash=workflowDigest(settingsFor('workflow_comparison')),sources=sourceHash();
  const prepared=prepareWorkflowComparison(root,name,applicationRevision,frozen.slots,{campaignId:campaign.id,fixtureHash,sourceHash:sources,runtimeHash});
  copyFileSync(database,join(directory,'fixture.sqlite'),constants.COPYFILE_EXCL);chmodSync(join(directory,'fixture.sqlite'),0o600);
  privateJson(join(directory,'fixture-material.json'),frozen.material,true);
  privateJson(join(directory,'workflow-manifest.json'),{version:workflowCaseVersion,planHash:prepared.planHash,applicationRevision,sourceHash:sources,runtimeHash,fixtureHash,databaseHash:hashFile(join(directory,'fixture.sqlite')),fixture:frozen.fixture,slots:frozen.slots,rubric:workflowRubric},true);
  return {...prepared,fixtureHash,notice:'Offline preparation only. Three two-turn scenarios; six independent case/arm copies of the same fictional DB. No existing application database opened and no paid request made.'};
 }finally{rmSync(temporary,{recursive:true,force:true});}
}
function readManifest(root:string,name:string):{directory:string;manifest:z.infer<typeof manifestSchema>;plan:ReturnType<typeof inspectWorkflowComparison>}{const directory=directoryFor(root,name),manifest=manifestSchema.parse(readJson(join(directory,'workflow-manifest.json'))),plan=inspectWorkflowComparison(root,name);assert.equal(plan.planHash,manifest.planHash);assert.equal(plan.kind,manifest.kind);assert.equal(workflowDigest(plan.slots.map(({attempts,...slot})=>{void attempts;return slot;})),workflowDigest(manifest.slots));assert.equal(hashFile(join(directory,'fixture.sqlite')),manifest.databaseHash);assert.equal(workflowDigest({fixture:manifest.fixture,records:readJson(join(directory,'fixture-material.json'))}),manifest.fixtureHash);assert.equal(workflowDigest(manifest.rubric),workflowDigest(workflowRubric));assert.deepEqual(plan.bindings,{campaignId:plan.bindings.campaignId,fixtureHash:manifest.fixtureHash,sourceHash:manifest.sourceHash,runtimeHash:manifest.runtimeHash});
 if(manifest.kind!=='workflow_comparison'){assert.ok(manifest.basis);assert.deepEqual(plan.original,{name:manifest.basis.name,planHash:manifest.basis.planHash});const original=readManifest(root,manifest.basis.name);assert.equal(original.plan.status,'completed');assert.equal(original.plan.planHash,manifest.basis.planHash);assert.equal(original.manifest.fixtureHash,manifest.basis.fixtureHash);assert.equal(original.manifest.databaseHash,manifest.basis.databaseHash);assert.equal(manifest.fixtureHash,manifest.basis.fixtureHash);assert.equal(manifest.databaseHash,manifest.basis.databaseHash);}
 else assert.equal(manifest.basis,undefined);
 if(manifest.kind==='workflow_capacity_confirmation'){assert.ok(manifest.after);assert.deepEqual(plan.after,manifest.after);const after=readManifest(root,manifest.after.name);assert.equal(after.plan.status,'closed_preflight');assert.equal(after.plan.planHash,manifest.after.planHash);assert.equal(after.manifest.fixtureHash,manifest.fixtureHash);assert.equal(after.manifest.databaseHash,manifest.databaseHash);}
 else assert.equal(manifest.after,undefined);
 return {directory,manifest,plan};}
export function inspectActualWorkflowComparison(root:string,name:string){const {directory,manifest,plan}=readManifest(root,name);return {...plan,fixtureHash:manifest.fixtureHash,execution:existsSync(join(directory,'execution.json'))?readJson(join(directory,'execution.json')):null};}

/** Separate corrective run; original evidence and immutable fixture are read-only. */
export function prepareActualWorkflowCapacityFollowup(root:string,name:string,originalName:string){
 committedSource();const directory=directoryFor(root,name);assert.equal(existsSync(directory),false,'Evidence cannot be replaced.');
 const original=readManifest(root,originalName);assert.equal(original.manifest.kind,'workflow_comparison');assert.equal(original.plan.status,'completed');assert.equal(original.plan.unresolved.length,0);
 const age=Date.now()-Date.parse(original.manifest.fixture.preparedAt);assert.ok(Number.isFinite(age)&&age>=0&&age<86400000,'The original source fixture must still be within its frozen one-day window.');
 const slots:WorkflowComparisonSlot[]=original.manifest.slots.filter(slot=>slot.role!=='acquisitions').map(slot=>({...slot,employeeRequestId:`capacity-${slot.role}-${slot.arm}-${slot.turn}-${randomUUID()}`,maxCalls:5}));
 const applicationRevision=revision(),runtimeHash=workflowDigest(settingsFor('workflow_capacity_followup')),sources=sourceHash(),basis={name:originalName,planHash:original.plan.planHash,fixtureHash:original.manifest.fixtureHash,databaseHash:original.manifest.databaseHash};
 const prepared=prepareWorkflowCapacityFollowup(root,name,applicationRevision,slots,{...original.plan.bindings,sourceHash:sources,runtimeHash},{name:originalName,planHash:original.plan.planHash});
 for(const file of ['fixture.sqlite','fixture-material.json']){copyFileSync(join(original.directory,file),join(directory,file),constants.COPYFILE_EXCL);chmodSync(join(directory,file),0o600);}
 privateJson(join(directory,'workflow-manifest.json'),{...original.manifest,kind:'workflow_capacity_followup',basis,planHash:prepared.planHash,applicationRevision,sourceHash:sources,runtimeHash,slots},true);
 return {...prepared,fixtureHash:original.manifest.fixtureHash,notice:'Separate capacity/output-representation correction: original disposition and management prompts, fixtures, interventions and scoring; five responses per turn, normal eight-tool limit, 20,000 counted input cap. Acquisitions are not repeated. Original evidence is unchanged; no paid request made.'};
}

export function closeActualWorkflowPreflight(root:string,name:string,planHash:string){const saved=readManifest(root,name);assert.equal(saved.plan.planHash,planHash);return closeWorkflowAfterCountLimit(root,name,planHash);}
/** Final bounded confirmation; no scenario or failed historical result is rewritten. */
export function prepareActualWorkflowCapacityConfirmation(root:string,name:string,originalName:string,afterName:string){
 committedSource();const directory=directoryFor(root,name);assert.equal(existsSync(directory),false,'Evidence cannot be replaced.');
 const original=readManifest(root,originalName),after=readManifest(root,afterName);assert.equal(original.manifest.kind,'workflow_comparison');assert.equal(original.plan.status,'completed');assert.equal(after.manifest.kind,'workflow_capacity_followup');assert.equal(after.plan.status,'closed_preflight');assert.deepEqual(after.plan.original,{name:originalName,planHash:original.plan.planHash});
 const age=Date.now()-Date.parse(original.manifest.fixture.preparedAt);assert.ok(Number.isFinite(age)&&age>=0&&age<86400000,'The original source fixture must still be within its frozen one-day window.');
 const slots:WorkflowComparisonSlot[]=original.manifest.slots.filter(slot=>slot.role!=='acquisitions').map(slot=>({...slot,employeeRequestId:`confirmation-${slot.role}-${slot.arm}-${slot.turn}-${randomUUID()}`,maxCalls:slot.role==='manager'&&slot.turn===0?3:5}));
 const applicationRevision=revision(),runtimeHash=workflowDigest(settingsFor('workflow_capacity_confirmation')),sources=sourceHash(),basis={name:originalName,planHash:original.plan.planHash,fixtureHash:original.manifest.fixtureHash,databaseHash:original.manifest.databaseHash};
 const prepared=prepareWorkflowCapacityConfirmation(root,name,applicationRevision,slots,{...original.plan.bindings,sourceHash:sources,runtimeHash},{name:originalName,planHash:original.plan.planHash},{name:afterName,planHash:after.plan.planHash});assert.ok(prepared.after);
 for(const file of ['fixture.sqlite','fixture-material.json']){copyFileSync(join(original.directory,file),join(directory,file),constants.COPYFILE_EXCL);chmodSync(join(directory,file),0o600);}
 privateJson(join(directory,'workflow-manifest.json'),{...original.manifest,kind:'workflow_capacity_confirmation',basis,after:prepared.after,planHash:prepared.planHash,applicationRevision,sourceHash:sources,runtimeHash,slots},true);
 return {...prepared,fixtureHash:original.manifest.fixtureHash,notice:'Final bounded confirmation after a verified input-count stop. Original fixtures, requests, interventions and scoring; 25,000 counted input limit and 36 maximum responses. Production defaults and original results are unchanged. No paid request made.'};
}

/** Executes ordinary chat/tools. The live model chooses the sequence; only reviewed tool capabilities can execute. */
export async function runActualWorkflowComparison(root:string,name:string,approval:{planHash:string;maximumCents:number},transport:EvaluationTransport){
 committedSource();
 const {directory,manifest,plan}=readManifest(root,name);assert.equal(approval.planHash,manifest.planHash);assert.equal(approval.maximumCents,999);assert.equal(plan.status,'prepared');assert.equal(plan.attemptedCalls,0);assert.equal(revision(),manifest.applicationRevision);assert.equal(sourceHash(),manifest.sourceHash);assert.equal(workflowDigest(settingsFor(manifest.kind)),manifest.runtimeHash);
 const fixtureAge=Date.now()-Date.parse(manifest.fixture.preparedAt);assert.ok(Number.isFinite(fixtureAge)&&fixtureAge>=0&&fixtureAge<86400000,'Prepare and run within one day, away from the fixed future deadline.');
 const key=process.env.OPENAI_API_KEY;assert.ok(key&&key.trim(),'A server credential is required only for the admitted run.');
 privateJson(join(directory,'execution.json'),{status:'running',startedAt:new Date().toISOString(),planHash:manifest.planHash},true);
 const originalFetch=globalThis.fetch,results:unknown[]=[];let active:WorkflowComparisonSlot|undefined,renderedRequest='',fetches=0,transportFailed=false;
 const evidence={version:1,kind:manifest.kind==='workflow_capacity_confirmation'?'workflow_final_bounded_capacity_confirmation':manifest.kind==='workflow_capacity_followup'?'workflow_capacity_and_output_representation_followup':'actual_workflow_catalog_ablation',...(manifest.basis?{basis:manifest.basis}:{}),...(manifest.after?{after:manifest.after}:{}),synthetic:true,fixtureHash:manifest.fixtureHash,planHash:manifest.planHash,rubric:workflowRubric,results};
 try{
  globalThis.fetch=async(input,options)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   if(url!=='https://api.openai.com/v1/responses'||options?.method!=='POST'||typeof options.body!=='string'||!active)throw new Error('Only admitted comparison text requests are allowed.');
   const requestId=new Headers(options.headers).get('X-Client-Request-Id');assert.ok(requestId);fetches++;
   let raw:Record<string,unknown>;
   try{raw=await executeWorkflowComparisonRequest(root,name,approval,{slotId:active.id,conversationId:active.conversationId,employeeRequestId:active.employeeRequestId,renderedRequest,requestId,body:options.body},transport);}catch(error){transportFailed=true;throw error;}
   const calls=z.array(z.record(z.string(),z.unknown())).parse(raw.output).filter(item=>item.type==='function_call');
   if(calls.some(call=>typeof call.name!=='string'||!workflowAllowedTools[active!.role].includes(call.name)))throw new Error('The model selected a capability outside this reviewed fictional workflow. Its paid receipt is retained; no returned action executed.');
   return new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
  };
  const selectedRoles=workflowRoles.filter(role=>manifest.slots.some(slot=>slot.role===role));
  for(const role of selectedRoles)for(const arm of workflowArms){
   const database=join(directory,`${role}-${arm}.sqlite`);copyFileSync(join(directory,'fixture.sqlite'),database,constants.COPYFILE_EXCL);chmodSync(database,0o600);
   await isolated(database,key,manifest.slots.find(slot=>slot.role===role&&slot.arm===arm&&slot.turn===0)!.maxCalls,async()=>{
    getDb({initialize:false});assert.equal(workflowDigest({fixture:manifest.fixture,records:snapshot()}),manifest.fixtureHash);const protectedBefore=workflowBusinessSnapshot(),actor=demoActor(role);let state=workflowStart(role,manifest.fixture),priorFailed=false;
    for(const turn of [0,1] as const){
     active=manifest.slots.find(s=>s.role===role&&s.arm===arm&&s.turn===turn)!;
     process.env.AGENTDESK_TEXT_MAX_ROUNDS=String(active.maxCalls);
     if(priorFailed){const skipped={slotId:active.id,status:'prerequisite_skipped' as const,reason:'The first turn did not establish the required current saved artifact.',at:new Date().toISOString()};results.push(skipped);privateJson(join(directory,'workflow-evidence.json'),evidence);recordWorkflowComparisonOutcome(root,name,manifest.planHash,{slotId:active.id,status:skipped.status,reason:skipped.reason,evidenceHash:workflowDigest(skipped)});continue;}
     renderedRequest=active.request.replace('{{threadId}}',state.threadId??'');assert.ok(!renderedRequest.includes('{{'));
     const previousCallIds=new Set((getDb().prepare('SELECT call_id FROM assistant_tool_receipts WHERE conversation_id=?').all(active.conversationId) as {call_id:string}[]).map(row=>row.call_id));
     const beforeCalls=fetches,startedAt=new Date().toISOString(),result=await withSpecialistGuidanceEvaluation(actor,arm==='guided'?'included':'omitted',()=>chat(actor,renderedRequest,active!.conversationId,active!.employeeRequestId));
     if(transportFailed)throw new Error('Admitted dispatch stopped; inspect the campaign before any further provider call.');
     const execution=getDb().prepare('SELECT phase,data FROM text_executions WHERE request_id=?').get(active.employeeRequestId) as {phase:string;data:string}|undefined;
     const items=execution?(JSON.parse(execution.data) as {items?:Record<string,unknown>[]}).items??[]:[];
     const calls=items.filter(item=>item.type==='function_call'&&!previousCallIds.has(String(item.call_id))),toolNames=calls.map(item=>String(item.name)),callIds=new Set(calls.map(item=>String(item.call_id)));
     const receipts=(getDb().prepare('SELECT call_id,result FROM assistant_tool_receipts WHERE conversation_id=? ORDER BY rowid').all(active.conversationId) as {call_id:string;result:string}[]).filter(row=>callIds.has(row.call_id)).map(row=>({callId:row.call_id,result:JSON.parse(row.result)}));
     const beforeReplay=fetches,beforeSnapshot=workflowDigest(snapshot()),replay=await withSpecialistGuidanceEvaluation(actor,arm==='guided'?'included':'omitted',()=>chat(actor,renderedRequest,active!.conversationId,active!.employeeRequestId));
     const replayVerified=fetches===beforeReplay&&workflowDigest(replay)===workflowDigest(result)&&workflowDigest(snapshot())===beforeSnapshot;
     let outcome:unknown,reason:string|undefined;
     try{
      assert.equal(execution?.phase,'completed');assert.equal(replayVerified,true,'Exact replay changed state or made another request.');assert.ok(receipts.every(receipt=>receipt.result.completed!==false&&!receipt.result.error),'A selected tool failed.');
      // Require the explicitly requested existing-buyer check, then judge saved
      // current results rather than enforcing a particular live tool sequence.
      const required=role==='dispositions'&&turn===0?['match_buyers']:[];
      for(const tool of required)assert.ok(toolNames.includes(tool),`Missing required workflow capability: ${tool}`);
      if(turn===0){state=workflowIntervene(role,manifest.fixture,state,result.result);outcome={operatorEvents:state.operatorEvents};}else outcome=workflowFinish(role,manifest.fixture,state);
      assert.deepEqual(workflowBusinessSnapshot(),protectedBefore,'A protected CRM, inventory, research, channel or payment record changed.');
     }catch(error){reason=error instanceof Error?error.message:'The saved workflow did not pass its authored checks.';priorFailed=turn===0;}
     const toolCalls=calls.map(call=>({name:call.name,callId:call.call_id,arguments:call.arguments}));
     const entry={slotId:active.id,role,arm,turn,request:renderedRequest,startedAt,finishedAt:new Date().toISOString(),modelCalls:fetches-beforeCalls,executionPhase:execution?.phase,response:result.result,conversation:result.conversation,toolNames,toolCalls,receipts,replayVerified,operatorEvents:state.operatorEvents,outcome,status:reason?'quality_failed':'completed',...(reason?{reason}:{})};
     results.push(entry);privateJson(join(directory,'workflow-evidence.json'),evidence);
     recordWorkflowComparisonOutcome(root,name,manifest.planHash,{slotId:active.id,status:reason?'quality_failed':'completed',evidenceHash:workflowDigest(entry),...(reason?{reason}:{})});
    }
    getDb().pragma('wal_checkpoint(TRUNCATE)');
   },manifest.kind);
  }
  const finished=finishWorkflowComparison(root,name,manifest.planHash);privateJson(join(directory,'workflow-evidence.json'),evidence);privateJson(join(directory,'execution.json'),{status:'completed',planHash:manifest.planHash,finishedAt:new Date().toISOString()});return {...finished,evidenceFile:join(directory,'workflow-evidence.json'),notice:'Review actual artifacts and blinded answers separately. Authored checks do not establish expert competence or prove a general advantage.'};
 }catch{privateJson(join(directory,'workflow-evidence.json'),evidence);privateJson(join(directory,'execution.json'),{status:'stopped',planHash:manifest.planHash,stoppedAt:active?.id,finishedAt:new Date().toISOString(),reason:'Stopped without automatically replaying uncertain usage. Inspect campaign and artifact evidence.'});throw new Error('Workflow comparison stopped. Inspect saved evidence and the shared campaign; no automatic restart is available.');}
 finally{globalThis.fetch=originalFetch;}
}
async function main(){const [command,name,...args]=process.argv.slice(2),root=defaultEvaluationRoot();assert.ok(name,'Use prepare, prepare-followup --from <original>, prepare-confirmation --from <original> --after <closed-followup>, close-preflight --approve-plan <hash>, inspect, or run --approve-plan <hash> --maximum-cents 999.');if(command==='prepare'&&!args.length)return prepareActualWorkflowComparison(root,name);if(command==='prepare-followup'&&args.length===2&&args[0]==='--from')return prepareActualWorkflowCapacityFollowup(root,name,args[1]);if(command==='prepare-confirmation'&&args.length===4&&args[0]==='--from'&&args[2]==='--after')return prepareActualWorkflowCapacityConfirmation(root,name,args[1],args[3]);if(command==='close-preflight'&&args.length===2&&args[0]==='--approve-plan'&&/^[a-f0-9]{64}$/.test(args[1]))return closeActualWorkflowPreflight(root,name,args[1]);if(command==='inspect'&&!args.length)return inspectActualWorkflowComparison(root,name);assert.ok(command==='run'&&args.length===4&&args[0]==='--approve-plan'&&/^[a-f0-9]{64}$/.test(args[1])&&args[2]==='--maximum-cents'&&args[3]==='999');if(existsSync('.env.local'))process.loadEnvFile('.env.local');const key=process.env.OPENAI_API_KEY;assert.ok(key&&key.trim());return runActualWorkflowComparison(root,name,{planHash:args[1],maximumCents:999},actualRehearsalTransport(key));}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.info(JSON.stringify(await main(),null,2));}catch{console.error('Workflow comparison stopped. Inspect its frozen manifest, execution evidence and campaign ledger. No automatic provider retry was made.');process.exitCode=1;}}
