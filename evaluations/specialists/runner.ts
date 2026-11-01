import {createHash,randomUUID,randomInt} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {z} from 'zod';
import {prepareFirstPassQualityPackets} from './packets';

/** Operator-only advisory evaluation. This module never opens an app database. */
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const schemaVersion=2;
const tokenCap=6000,outputCap=4096,maximumCalls=24;
// A conservative input rate covers the documented input/cache-write classes.
// It is an accounting ceiling, not a claim about the actual provider invoice.
const modelRates={
 'gpt-6-astra':{inputNanosPerToken:25_000,outputNanosPerToken:50_000},
 'gpt-6.1-sol':{inputNanosPerToken:5_000,outputNanosPerToken:10_000},
} as const;
export type EvaluationModel=keyof typeof modelRates;
export const evaluationPolicy={comparison:'model_comparison',models:modelRates,reasoning:'high',serviceTier:'default',maxInputTokens:tokenCap,maxOutputTokens:outputCap,maximumCalls,
 accounting:{source:'https://developers.openai.com/api/docs/pricing',checkedAt:'2026-11-01',basis:'Conservative accounting ceilings include the documented standard input/cache-write classes. These are not actual invoice prices.'},
 maximumNanos:12*(tokenCap*25_000+outputCap*50_000)+12*(tokenCap*5_000+outputCap*10_000),requestTimeoutMs:120_000} as const;
const campaignMaximumCents=999;
const price=(model:EvaluationModel,input:number,output:number)=>input*modelRates[model].inputNanosPerToken+output*modelRates[model].outputNanosPerToken;

const safeCount=z.number().int().min(0).max(1_000_000_000);
const item=z.record(z.string(),z.unknown());
type JsonItem=Record<string,unknown>;
type Prepared=ReturnType<typeof prepareFirstPassQualityPackets>;
type Packet=Prepared['modelPackets']['packets'][number];
type AttemptStatus='dispatching'|'completed'|'incomplete'|'rejected'|'unknown'|'invalid_output'|'usage_overrun';
export interface EvaluationPlan {
 version:number;runId:string;createdAt:string;applicationRevision:string;runnerSourceHash:string;methodRevision:string;fictional:true;scope:'advisory_only';
 policy:typeof evaluationPolicy;packets:Packet[];reviewerTemplateHash:string;modelKeyHash:string;planHash:string;
}
interface Usage {inputTokens:number;cachedInputTokens:number;outputTokens:number;reasoningTokens:number}
export interface EvaluationAttempt {
 id:string;packetIndex:number;turn:number;model:EvaluationModel;status:AttemptStatus;requestHash:string;inputCount:number;reservedNanos:number;startedAt:string;
 requestFile:string;responseFile?:string;responseHash?:string;responseId?:string;httpStatus?:number;providerRequestId?:string;elapsedMs?:number;
 usage?:Usage;accountedNanos?:number;finishedAt?:string;failure?:string;
}
export interface EvaluationLedger {
 version:number;planHash:string;approval:{planHash:string;maximumCents:number;recordedAt:string;source:'explicit_operator_cli'}|null;
 status:'prepared'|'running'|'paused'|'completed'|'stopped';attempts:EvaluationAttempt[];updatedAt:string;lastCountFailure?:{attemptId:string;code:string;at:string};
}
export interface EvaluationTransport {
 count:(body:string)=>Promise<{status:number;body:string;requestId?:string}>;
 create:(body:string,clientRequestId:string)=>Promise<{status:number;body:string;requestId?:string}>;
}
const err=(message:string)=>new Error(message);
const now=()=>new Date().toISOString();
const runnerSourceHash=()=>fileHash(readFileSync(new URL(import.meta.url),'utf8'));
function readJson(path:string):unknown {try{return JSON.parse(readFileSync(path,'utf8'));}catch{throw err('Saved evaluation evidence could not be read. No provider request was sent.');}}
function syncDirectory(path:string){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function durableJson(path:string,value:unknown,exclusive=false){
 const serialized=JSON.stringify(value,null,2)+'\n';
 if(exclusive){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,serialized);fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(dirname(path));return;}
 const temporary=`${path}.${randomUUID()}.tmp`,fd=openSync(temporary,'wx',0o600);
 try{writeFileSync(fd,serialized);fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,path);syncDirectory(dirname(path));
}
function withLock<T>(root:string,work:()=>T):T {
 mkdirSync(root,{recursive:true,mode:0o700});const path=join(root,'.operator.lock');let fd:number;
 try{fd=openSync(path,'wx',0o600);}catch{throw err('An evaluator lock already exists. Confirm the previous operator process has stopped before investigating that lock; no provider request was sent.');}
 try{writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:now()}));fsyncSync(fd);}finally{closeSync(fd);}
 let result:T;
 try{result=work();}catch(e){unlinkSync(path);throw e;}
 if(result instanceof Promise)return result.finally(()=>unlinkSync(path)) as T;
 unlinkSync(path);return result;
}
function runDirectory(root:string,name:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(name))throw err('Use a simple new run name of at most 100 letters, digits, underscores or hyphens.');
 return join(resolve(root),name);
}
function planDigest(plan:Omit<EvaluationPlan,'planHash'>){return hash(plan);}
function readPlan(directory:string,dispatch=false):EvaluationPlan {
 const raw=readJson(join(directory,'plan.json')) as EvaluationPlan;
 if(!raw||typeof raw!=='object'||typeof raw.planHash!=='string')throw err('The immutable evaluation plan is missing or invalid.');
 const {planHash,...plan}=raw;
 if(planDigest(plan)!==planHash||dispatch&&(raw.runnerSourceHash!==runnerSourceHash()||hash(raw.policy)!==hash(evaluationPolicy))||raw.version!==schemaVersion||raw.packets?.length!==12||raw.scope!=='advisory_only'||raw.fictional!==true)throw err('The evaluation plan changed or uses an unsupported policy. No provider request was sent.');
 if(hash(readJson(join(directory,'reviewer-templates.json')))!==raw.reviewerTemplateHash||hash(readJson(join(directory,'model-key.json')))!==raw.modelKeyHash)throw err('The frozen reviewer or model-key evidence changed. No provider request was sent.');
 const seen=new Set<string>();
 for(const packet of raw.packets){
  if(!packet||![1,2].includes(packet.sample)||!['A','B'].includes(packet.label)||!['specialist-33','specialist-34','specialist-35'].includes(packet.caseId)||packet.payload?.turns?.length!==2||!packet.payload.instructions||packet.payload.turns.some(turn=>typeof turn.request!=='string'||typeof turn.context!=='string'))throw err('The frozen model packets are invalid.');
  const key=`${packet.sample}:${packet.caseId}:${packet.label}`;if(seen.has(key))throw err('Duplicate evaluation packet.');seen.add(key);
 }
 const modelKey=readJson(join(directory,'model-key.json')) as {assignments:{sample:number;caseId:string;label:string;model:EvaluationModel}[]};
 if(!Array.isArray(modelKey.assignments)||modelKey.assignments.length!==12||new Set(modelKey.assignments.map(value=>`${value.sample}:${value.caseId}:${value.label}`)).size!==12||modelKey.assignments.some(value=>!seen.has(`${value.sample}:${value.caseId}:${value.label}`)))throw err('The complete model key is invalid.');
 for(let index=0;index<raw.packets.length;index++){const packet=raw.packets[index],other=raw.packets.find(value=>value.sample===packet.sample&&value.caseId===packet.caseId&&value.label!==packet.label);if(!other||hash(other.payload)!==hash(packet.payload))throw err('Both models must receive the same specialist instructions and case turns.');modelForPacket(directory,raw,index);}
 return raw;
}
function readLedger(directory:string,plan:EvaluationPlan):EvaluationLedger {
 const raw=readJson(join(directory,'ledger.json')) as EvaluationLedger;
 if(!raw||raw.version!==schemaVersion||raw.planHash!==plan.planHash||!Array.isArray(raw.attempts)||!['prepared','running','paused','completed','stopped'].includes(raw.status))throw err('Saved evaluation accounting is invalid. No provider request was sent.');
 const ids=new Set<string>();
 for(const [index,attempt] of raw.attempts.entries()){
  if(!attempt||typeof attempt.id!=='string'||ids.has(attempt.id)||!Number.isInteger(attempt.packetIndex)||attempt.packetIndex<0||attempt.packetIndex>=12||![0,1].includes(attempt.turn)||attempt.id!==attemptId(attempt.packetIndex,attempt.turn)||!['dispatching','completed','incomplete','rejected','unknown','invalid_output','usage_overrun'].includes(attempt.status)||!safeCount.safeParse(attempt.inputCount).success||attempt.inputCount>tokenCap||!Object.hasOwn(modelRates,attempt.model)||attempt.reservedNanos!==price(attempt.model,attempt.inputCount,outputCap))throw err('Saved attempt accounting is invalid. No provider request was sent.');
  if(attempt.id!==attemptId(Math.floor(index/2),index%2))throw err('Saved attempt order is invalid. No provider request was sent.');ids.add(attempt.id);
  if(attempt.accountedNanos!==undefined&&(!Number.isSafeInteger(attempt.accountedNanos)||attempt.accountedNanos<0))throw err('Saved usage accounting is invalid.');
 }
 if(raw.approval&&(raw.approval.planHash!==plan.planHash||!Number.isSafeInteger(raw.approval.maximumCents)||raw.approval.maximumCents*10_000_000<plan.policy.maximumNanos))throw err('The saved whole-run approval is invalid.');
 if(raw.status==='completed'&&(raw.attempts.length!==24||raw.attempts.some(attempt=>attempt.status!=='completed')))throw err('A completed comparison must contain all 24 completed receipts.');
 if(raw.status==='completed')for(const attempt of raw.attempts){readSavedRequest(directory,attempt);completedResponse(directory,attempt);}
 return raw;
}
function saveLedger(directory:string,ledger:EvaluationLedger){ledger.updatedAt=now();durableJson(join(directory,'ledger.json'),ledger);}
interface CampaignRun {name:string;planHash:string;kind:'model_comparison'|'tool_rehearsal'|'workflow_comparison';maximumNanos:number}
interface Campaign {version:1;id:string;maximumCents:999;createdAt:string;runs:CampaignRun[]}
function campaignFile(root:string){return join(root,'campaign.json');}
function readCampaign(root:string):Campaign {
 const value=readJson(campaignFile(root)) as Campaign;
 if(value.version!==1||value.maximumCents!==campaignMaximumCents||!value.id||!Array.isArray(value.runs)||value.runs.some(run=>!['model_comparison','tool_rehearsal','workflow_comparison'].includes(run.kind))||new Set(value.runs.map(run=>run.name)).size!==value.runs.length||new Set(value.runs.map(run=>run.planHash)).size!==value.runs.length)throw err('The shared campaign accounting is invalid. No further paid testing is allowed.');return value;
}
function campaignRuns(root:string,campaign:Campaign,allowNew?:string){
 const unexpected=readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&existsSync(join(root,entry.name,'plan.json'))&&!campaign.runs.some(run=>run.name===entry.name)&&entry.name!==allowNew);
 if(unexpected.length)throw err('Unregistered evaluation evidence exists. Reconcile the shared campaign before any further paid test.');
 return campaign.runs.map(run=>{const directory=runDirectory(root,run.name);let plan:EvaluationPlan|ToolRehearsalPlan|WorkflowComparisonPlan,ledger:EvaluationLedger;
  switch(run.kind){case 'model_comparison':plan=readPlan(directory);ledger=readLedger(directory,plan);break;case 'tool_rehearsal':plan=readToolPlan(directory);ledger=readToolLedger(directory,plan);break;case 'workflow_comparison':plan=readWorkflowPlan(directory);if(plan.bindings.campaignId!==campaign.id)throw err('The workflow campaign identity changed.');ledger=readWorkflowLedger(directory,plan);break;default:throw err('Unknown campaign evidence kind.');}
  if(plan.planHash!==run.planHash||plan.policy.maximumNanos!==run.maximumNanos)throw err('A registered campaign plan changed or is missing. Its cost cannot be reset.');
  return {run,ledger};});
}
export function inspectEvaluationCampaign(root:string){
 root=resolve(root);if(!existsSync(campaignFile(root)))return {maximumUsd:9.99,accountedUsd:0,committedMaximumUsd:0,remainingReservableUsd:9.99,runs:[],unresolved:[] as string[]};
 const campaign=readCampaign(root),runs=campaignRuns(root,campaign),accountedNanos=runs.reduce((sum,{ledger})=>sum+accounted(ledger),0),committedNanos=runs.reduce((sum,{run,ledger})=>sum+(ledger.status==='completed'?accounted(ledger):Math.max(run.maximumNanos,accounted(ledger))),0);
 return {maximumUsd:9.99,accountedUsd:accountedNanos/1e9,committedMaximumUsd:committedNanos/1e9,remainingReservableUsd:Math.max(0,(campaign.maximumCents*10_000_000-committedNanos)/1e9),runs:runs.map(({run,ledger})=>({name:run.name,kind:run.kind,planHash:run.planHash,status:ledger.status,attemptedCalls:ledger.attempts.length,accountedUsd:accounted(ledger)/1e9})),unresolved:runs.flatMap(({run,ledger})=>ledger.attempts.filter(attempt=>['dispatching','unknown'].includes(attempt.status)).map(attempt=>`${run.name}:${attempt.id}`))};
}
function registerCampaignRun(root:string,run:CampaignRun){
 if(!existsSync(campaignFile(root)))durableJson(campaignFile(root),{version:1,id:randomUUID(),maximumCents:campaignMaximumCents,createdAt:now(),runs:[]},true);
 const campaign=readCampaign(root),existing=campaignRuns(root,campaign,run.name);
 if(campaign.runs.some(item=>item.name===run.name||item.planHash===run.planHash))throw err('This evaluation identity is already registered.');
 if(existing.some(({ledger})=>ledger.attempts.some(attempt=>['dispatching','unknown'].includes(attempt.status))))throw err('An unresolved provider outcome blocks further campaign work.');
 const committed=existing.reduce((sum,{run,ledger})=>sum+(ledger.status==='completed'?accounted(ledger):Math.max(run.maximumNanos,accounted(ledger))),0);
 if(committed+run.maximumNanos>campaign.maximumCents*10_000_000)throw err('The complete new test would exceed the shared $9.99 campaign cap. No provider request was sent.');
 campaign.runs.push(run);durableJson(campaignFile(root),campaign);
}
function assertNoUncertainty(root:string,except?:string){
 if(!existsSync(campaignFile(root)))return;
 const campaign=readCampaign(root),runs=campaignRuns(root,campaign);
 if(runs.some(({run,ledger})=>run.name!==except&&ledger.attempts.some(attempt=>['dispatching','unknown'].includes(attempt.status))))throw err('Another evaluation has an unresolved provider outcome. Reconcile its saved evidence before preparing or running more comparisons.');
}
function assertCampaignAdmission(root:string,name:string,additionalNanos=0){
 const campaign=readCampaign(root),runs=campaignRuns(root,campaign),selected=runs.find(item=>item.run.name===name);
 if(!selected)throw err('This run is not registered in the shared campaign.');
 if(runs.some(({ledger})=>ledger.attempts.some(attempt=>['dispatching','unknown'].includes(attempt.status))))throw err('Unresolved provider usage blocks further paid tests.');
 if(runs.reduce((sum,{ledger})=>sum+accounted(ledger),0)+additionalNanos>campaign.maximumCents*10_000_000)throw err('The next request would exceed the shared $9.99 campaign cap.');
}
function assertCampaignCapacity(root:string,maximumNanos:number){
 if(!existsSync(campaignFile(root)))return;
 const campaign=readCampaign(root),runs=campaignRuns(root,campaign),committed=runs.reduce((sum,{run,ledger})=>sum+(ledger.status==='completed'?accounted(ledger):Math.max(run.maximumNanos,accounted(ledger))),0);
 if(committed+maximumNanos>campaign.maximumCents*10_000_000)throw err('The complete new test would exceed the shared $9.99 campaign cap. No provider request was sent.');
}
export function prepareEvaluation(root:string,name:string,applicationRevision:string){
 if(!/^[a-f0-9]{40}$/.test(applicationRevision))throw err('Freeze the exact 40-character application commit before preparing an evaluation.');
 root=resolve(root);return withLock(root,()=>{
  assertNoUncertainty(root);const directory=runDirectory(root,name);if(existsSync(directory))throw err('That run already exists. Evidence cannot be overwritten.');
  const runId=randomUUID(),samples=[1,2].map(sample=>prepareFirstPassQualityPackets({sample,runId}));
  const packets:Packet[]=[],assignments:{sample:number;caseId:string;label:'A'|'B';model:EvaluationModel}[]=[];
  for(const sample of samples)for(const caseId of ['specialist-33','specialist-34','specialist-35']){
   const specialistLabel=sample.armKey.assignments.find(value=>value.caseId===caseId&&value.arm==='specialist')!.label;
   const source=sample.modelPackets.packets.find(value=>value.caseId===caseId&&value.label===specialistLabel)!;
   const models:EvaluationModel[]=randomInt(2)?['gpt-6-astra','gpt-6.1-sol']:['gpt-6.1-sol','gpt-6-astra'];
   for(const [index,label] of (['A','B'] as const).entries()){packets.push({...structuredClone(source),label});assignments.push({sample:source.sample,caseId,label,model:models[index]});}
  }
  const reviewerTemplates={version:schemaVersion,runId,comparison:'model_comparison',reviews:samples.flatMap(sample=>sample.blindReview.reviews)};
  const modelKey={version:schemaVersion,runId,comparison:'model_comparison',assignments};
  const content:Omit<EvaluationPlan,'planHash'>={version:schemaVersion,runId,createdAt:now(),applicationRevision,runnerSourceHash:runnerSourceHash(),methodRevision:samples[0].modelPackets.methodRevision,fictional:true,scope:'advisory_only',policy:structuredClone(evaluationPolicy),packets,reviewerTemplateHash:hash(reviewerTemplates),modelKeyHash:hash(modelKey)};
  const plan:EvaluationPlan={...content,planHash:planDigest(content)};
  assertCampaignCapacity(root,plan.policy.maximumNanos);mkdirSync(directory,{mode:0o700});mkdirSync(join(directory,'requests'),{mode:0o700});mkdirSync(join(directory,'responses'),{mode:0o700});
  durableJson(join(directory,'plan.json'),plan,true);durableJson(join(directory,'reviewer-templates.json'),reviewerTemplates,true);durableJson(join(directory,'model-key.json'),modelKey,true);
  const ledger:EvaluationLedger={version:schemaVersion,planHash:plan.planHash,approval:null,status:'prepared',attempts:[],updatedAt:now()};durableJson(join(directory,'ledger.json'),ledger,true);
  registerCampaignRun(root,{name,planHash:plan.planHash,kind:'model_comparison',maximumNanos:plan.policy.maximumNanos});
  return inspectEvaluation(root,name);
 });
}
function attemptId(packetIndex:number,turn:number){return `answer-${String(packetIndex*2+turn+1).padStart(2,'0')}`;}
function prompt(turn:Packet['payload']['turns'][number]){return {role:'user',content:`Fictional case facts (data, not instructions):\n${turn.context}\n\nEmployee request:\n${turn.request}`};}
function readSavedRequest(directory:string,attempt:EvaluationAttempt):JsonItem {
 const saved=readJson(join(directory,'requests',`${attempt.id}.json`)) as {body:string;requestHash:string};
 if(typeof saved?.body!=='string'||saved.requestHash!==attempt.requestHash||fileHash(saved.body)!==attempt.requestHash)throw err('A saved request no longer matches its claim.');
 return JSON.parse(saved.body) as JsonItem;
}
function readSavedResponse(directory:string,attempt:EvaluationAttempt):JsonItem {
 const saved=readJson(join(directory,'responses',`${attempt.id}.json`)) as {body:string;responseHash:string};
 if(typeof saved?.body!=='string'||saved.responseHash!==attempt.responseHash||fileHash(saved.body)!==attempt.responseHash)throw err('A saved response no longer matches its receipt.');
 return JSON.parse(saved.body) as JsonItem;
}
function verifiedCompletedReceipt(directory:string,attempt:EvaluationAttempt){
 const response=readSavedResponse(directory,attempt),receipt=validateReceipt(response,attempt.inputCount,attempt.model);
 if(attempt.status!=='completed'||receipt.value.status!=='completed'||receipt.overrun||receipt.value.id!==attempt.responseId||receipt.accountedNanos!==attempt.accountedNanos||hash(receipt.usage)!==hash(attempt.usage))throw err('The saved completed receipt is inconsistent. No further provider request was sent.');
 return response;
}
function completedResponse(directory:string,attempt:EvaluationAttempt){const response=verifiedCompletedReceipt(directory,attempt);validateOutput(response);return response;}
function modelForPacket(directory:string,plan:EvaluationPlan,packetIndex:number):EvaluationModel {
 const packet=plan.packets[packetIndex],key=readJson(join(directory,'model-key.json')) as {assignments:{sample:number;caseId:string;label:string;model:EvaluationModel}[]};
 const assignments=key.assignments.filter(value=>value.sample===packet.sample&&value.caseId===packet.caseId);
 if(assignments.length!==2||new Set(assignments.map(value=>value.model)).size!==2||new Set(assignments.map(value=>value.label)).size!==2||assignments.some(value=>!Object.hasOwn(modelRates,value.model)||!['A','B'].includes(value.label)))throw err('The frozen model assignment is invalid.');
 const selected=assignments.find(value=>value.label===packet.label);if(!selected)throw err('The frozen model label is missing.');return selected.model;
}
function buildPayload(plan:EvaluationPlan,packetIndex:number,turn:number,directory:string,ledger:EvaluationLedger){
 const packet=plan.packets[packetIndex];let input:JsonItem[]=[prompt(packet.payload.turns[0])];
 if(turn===1){
  const previous=ledger.attempts.find(attempt=>attempt.id===attemptId(packetIndex,0));if(previous?.status!=='completed')throw err('The first answer must be completed and saved before revealing its correction.');
  const priorRequest=readSavedRequest(directory,previous),priorResponse=completedResponse(directory,previous);
  input=[...(priorRequest.input as JsonItem[]),...(priorResponse.output as JsonItem[]),prompt(packet.payload.turns[1])];
 }
 const model=modelForPacket(directory,plan,packetIndex);
 return {model,instructions:packet.payload.instructions,input,reasoning:{effort:plan.policy.reasoning},tools:[],max_output_tokens:plan.policy.maxOutputTokens,service_tier:plan.policy.serviceTier,store:false,include:['reasoning.encrypted_content'],parallel_tool_calls:false};
}
function countPayload(payload:ReturnType<typeof buildPayload>){const {max_output_tokens,service_tier,store,include,...counted}=payload;void max_output_tokens;void service_tier;void store;void include;return counted;}
function parseBoundedJson(body:string,maximum:number){if(typeof body!=='string'||Buffer.byteLength(body)>maximum)throw err('Invalid provider response.');try{return JSON.parse(body) as unknown;}catch{throw err('Invalid provider response.');}}
async function countedInput(directory:string,id:string,payload:unknown,limit:number,transport:EvaluationTransport){
 const countsDirectory=join(directory,'counts');mkdirSync(countsDirectory,{recursive:true,mode:0o700});const path=join(countsDirectory,`${id}-${randomUUID()}.json`),body=JSON.stringify(payload);
 let response:Awaited<ReturnType<EvaluationTransport['count']>>;
 try{response=await transport.count(body);}catch{durableJson(path,{requestBody:body,failureCode:'input_count_connection_failure',recordedAt:now()},true);throw err('input_count_connection_failure');}
 const evidence={requestBody:body,httpStatus:response.status,providerRequestId:response.requestId&&/^[A-Za-z0-9_.:-]{1,200}$/.test(response.requestId)?response.requestId:undefined,responseBody:response.body.slice(0,20000),responseBodyTruncated:response.body.length>20000,recordedAt:now()};
 let code:string|undefined,count:number|undefined;
 if(response.status<200||response.status>=300)code=`input_count_http_${response.status}`;
 else{try{const value=z.object({object:z.literal('response.input_tokens'),input_tokens:safeCount}).parse(parseBoundedJson(response.body,2000));if(value.input_tokens>limit)code='input_count_limit_exceeded';else count=value.input_tokens;}catch{code='input_count_invalid_response';}}
 durableJson(path,{...evidence,failureCode:code,inputCount:count},true);if(code)throw err(code);return count!;
}
function countFailure(directory:string,ledger:EvaluationLedger,id:string,error:unknown){const supplied=error instanceof Error?error.message:'';const code=/^input_count_(?:http_\d{3}|connection_failure|limit_exceeded|invalid_response)$/.test(supplied)?supplied:'input_count_evidence_failure';ledger.status='paused';ledger.lastCountFailure={attemptId:id,code,at:now()};saveLedger(directory,ledger);return code;}
const responseSchema=z.object({id:z.string().min(1).max(150),model:z.enum(['gpt-6-astra','gpt-6.1-sol']),service_tier:z.literal('default'),status:z.enum(['completed','incomplete','failed','canceled','cancelled']),usage:z.object({input_tokens:safeCount,output_tokens:safeCount,input_tokens_details:z.object({cached_tokens:safeCount.optional()}).passthrough().optional(),output_tokens_details:z.object({reasoning_tokens:safeCount.optional()}).passthrough().optional()}).passthrough(),output:z.array(item).max(100)}).passthrough();
function validateReceipt(raw:unknown,inputCount:number,model:EvaluationModel){
 const value=responseSchema.parse(raw),cached=value.usage.input_tokens_details?.cached_tokens??0,reasoning=value.usage.output_tokens_details?.reasoning_tokens??0;
 if(value.model!==model)throw err('The provider model differed from the claimed request.');
 if(cached>value.usage.input_tokens||reasoning>value.usage.output_tokens)throw err('Invalid usage subsets.');
 const usage:Usage={inputTokens:value.usage.input_tokens,cachedInputTokens:cached,outputTokens:value.usage.output_tokens,reasoningTokens:reasoning};
 const accountedNanos=price(model,usage.inputTokens,usage.outputTokens);
 return {value,usage,accountedNanos,overrun:usage.inputTokens>inputCount||usage.outputTokens>outputCap};
}
function validateOutput(raw:JsonItem):string {
 const output=z.array(item).max(100).parse(raw.output);const answers:string[]=[];
 for(const value of output){
  if(value.type==='reasoning'){if(value.encrypted_content!==undefined&&value.encrypted_content!==null&&typeof value.encrypted_content!=='string')throw err('Invalid retained reasoning.');continue;}
  if(value.type!=='message'||value.role!=='assistant'||value.status!==undefined&&value.status!=='completed'||value.phase!==undefined&&value.phase!==null&&!['commentary','final_answer'].includes(String(value.phase)))throw err('The advisory model returned an unsupported action or unfinished output.');
  const content=z.array(z.object({type:z.literal('output_text'),text:z.string(),annotations:z.array(z.unknown()).optional(),logprobs:z.array(z.unknown()).optional()}).passthrough()).parse(value.content);
  if(value.phase!=='commentary')answers.push(content.map(part=>part.text).join(''));
 }
 const answer=answers.join('\n').trim();if(!answer)throw err('No complete final advisory answer was returned.');return answer;
}
function accounted(ledger:EvaluationLedger){return ledger.attempts.reduce((sum,attempt)=>sum+(['dispatching','unknown'].includes(attempt.status)?attempt.reservedNanos:attempt.accountedNanos??(attempt.status==='rejected'?0:attempt.reservedNanos)),0);}
function publishBlindAnswers(directory:string,plan:EvaluationPlan,ledger:EvaluationLedger){
 const transcripts=plan.packets.flatMap((packet,packetIndex)=>{
  const attempts=[0,1].map(turn=>ledger.attempts.find(attempt=>attempt.id===attemptId(packetIndex,turn)));if(attempts.some(attempt=>attempt?.status!=='completed'))return [];
  return [{caseId:packet.caseId,sample:packet.sample,label:packet.label,turns:attempts.map((attempt,turn)=>({request:packet.payload.turns[turn].request,context:packet.payload.turns[turn].context,response:validateOutput(completedResponse(directory,attempt!))})),evidence:attempts.map(attempt=>({attemptId:attempt!.id,responseId:attempt!.responseId,requestHash:attempt!.requestHash,responseHash:attempt!.responseHash}))}];
 });
 durableJson(join(directory,'blind-answers.json'),{version:schemaVersion,runId:plan.runId,planHash:plan.planHash,status:ledger.status,transcripts,notice:'Actual advisory model transcripts only. Labels are randomized. Method instructions and model identities are withheld; this file contains no grades or employee acceptance.'});
}
export function inspectEvaluation(root:string,name:string){
 const directory=runDirectory(root,name),plan=readPlan(directory),ledger=readLedger(directory,plan);
 const models=(Object.keys(plan.policy.models) as EvaluationModel[]).map(model=>{const attempts=ledger.attempts.filter(a=>a.model===model);return {model,attemptedCalls:attempts.length,completedCalls:attempts.filter(a=>a.status==='completed').length,inputTokens:attempts.reduce((sum,a)=>sum+(a.usage?.inputTokens??0),0),cachedInputTokens:attempts.reduce((sum,a)=>sum+(a.usage?.cachedInputTokens??0),0),outputTokens:attempts.reduce((sum,a)=>sum+(a.usage?.outputTokens??0),0),reasoningTokens:attempts.reduce((sum,a)=>sum+(a.usage?.reasoningTokens??0),0),responseRequestMilliseconds:attempts.reduce((sum,a)=>sum+(a.elapsedMs??0),0),accountedMaximumUsd:accounted({...ledger,attempts})/1e9};});
 return {directory,planHash:plan.planHash,runId:plan.runId,applicationRevision:plan.applicationRevision,models:Object.keys(plan.policy.models),modelMetrics:models,comparison:plan.policy.comparison,reasoning:plan.policy.reasoning,maximumCalls:plan.policy.maximumCalls,maximumUsd:plan.policy.maximumNanos/1e9,minimumApprovalCents:Math.ceil(plan.policy.maximumNanos/10_000_000),status:ledger.status,completedCalls:ledger.attempts.filter(attempt=>attempt.status==='completed').length,attemptedCalls:ledger.attempts.length,accountedMaximumUsd:accounted(ledger)/1e9,lastCountFailure:ledger.lastCountFailure,unresolved:ledger.attempts.filter(attempt=>['dispatching','unknown'].includes(attempt.status)).map(attempt=>attempt.id),notice:'Conservative provider-cost accounting, not an invoice. Response-request timing includes transport/body receipt and excludes input counting and application processing. No application tokens, wallet, records, messages or settings are changed.'};
}

const toolPolicy={model:'gpt-6.1-sol',reasoning:'high',serviceTier:'default',maxInputTokens:20_000,maxOutputTokens:4096,maximumCalls:9,maxCallsPerScenario:3,maximumNanos:9*(20_000*5_000+4096*10_000)} as const;
export interface ToolRehearsalScenario {id:string;role:'dispositions'|'acquisitions'|'manager';request:string}
interface ToolRehearsalPlan {version:number;kind:'tool_rehearsal';runId:string;createdAt:string;applicationRevision:string;runnerSourceHash:string;policy:typeof toolPolicy;scenarios:ToolRehearsalScenario[];planHash:string}
function readToolPlan(directory:string,dispatch=false):ToolRehearsalPlan {
 const raw=readJson(join(directory,'plan.json')) as ToolRehearsalPlan;if(!raw||typeof raw!=='object')throw err('Tool rehearsal plan is missing.');const {planHash,...value}=raw;
 if(raw.version!==schemaVersion||raw.kind!=='tool_rehearsal'||hash(value)!==planHash||dispatch&&(raw.runnerSourceHash!==runnerSourceHash()||hash(raw.policy)!==hash(toolPolicy))||raw.scenarios?.length!==3||new Set(raw.scenarios.map(s=>s.id)).size!==3||new Set(raw.scenarios.map(s=>s.role)).size!==3)throw err('The tool rehearsal plan changed or is invalid.');return raw;
}
function readToolLedger(directory:string,plan:ToolRehearsalPlan):EvaluationLedger {
 const raw=readJson(join(directory,'ledger.json')) as EvaluationLedger;
 if(!raw||raw.version!==schemaVersion||raw.planHash!==plan.planHash||!Array.isArray(raw.attempts)||raw.attempts.length>9||!['prepared','running','paused','completed','stopped'].includes(raw.status)||new Set(raw.attempts.map(a=>a.id)).size!==raw.attempts.length)throw err('Tool rehearsal accounting is invalid.');
 const counts=[0,0,0];for(const a of raw.attempts){
  if(!/^tool-[a-f0-9]{32}$/.test(a.id)||![0,1,2].includes(a.packetIndex)||a.turn!==counts[a.packetIndex]++||a.turn>2||a.model!=='gpt-6.1-sol'||!safeCount.safeParse(a.inputCount).success||a.inputCount>20_000||a.reservedNanos!==price(a.model,a.inputCount,outputCap)||!['dispatching','completed','incomplete','rejected','unknown','invalid_output','usage_overrun'].includes(a.status)||a.accountedNanos!==undefined&&(!Number.isSafeInteger(a.accountedNanos)||a.accountedNanos<0))throw err('A saved tool rehearsal claim is invalid.');
 }
 if(raw.approval&&(raw.approval.planHash!==plan.planHash||!Number.isSafeInteger(raw.approval.maximumCents)||raw.approval.maximumCents>999||raw.approval.maximumCents*10_000_000<plan.policy.maximumNanos))throw err('The tool rehearsal approval is invalid.');
 if(raw.status==='completed'){if(raw.attempts.some(a=>a.status!=='completed')||[0,1,2].some(index=>!raw.attempts.some(a=>a.packetIndex===index)))throw err('A completed tool rehearsal requires all three scenarios and no unresolved calls.');for(const attempt of raw.attempts){readSavedRequest(directory,attempt);verifiedCompletedReceipt(directory,attempt);}}
 return raw;
}
export function prepareToolRehearsal(root:string,name:string,applicationRevision:string,scenarios:ToolRehearsalScenario[]){
 if(!/^[a-f0-9]{40}$/.test(applicationRevision))throw err('Freeze the exact application commit.');
 scenarios=z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),role:z.enum(['dispositions','acquisitions','manager']),request:z.string().trim().min(1).max(12000)}).strict()).length(3).parse(scenarios);
 if(new Set(scenarios.map(s=>s.id)).size!==3||new Set(scenarios.map(s=>s.role)).size!==3)throw err('Choose exactly one distinct scenario for each role.');
 root=resolve(root);return withLock(root,()=>{assertNoUncertainty(root);const directory=runDirectory(root,name);if(existsSync(directory))throw err('That run already exists. Evidence cannot be overwritten.');assertCampaignCapacity(root,toolPolicy.maximumNanos);
  const content={version:schemaVersion,kind:'tool_rehearsal' as const,runId:randomUUID(),createdAt:now(),applicationRevision,runnerSourceHash:runnerSourceHash(),policy:structuredClone(toolPolicy),scenarios};const plan:ToolRehearsalPlan={...content,planHash:hash(content)};
  mkdirSync(directory,{mode:0o700});mkdirSync(join(directory,'requests'),{mode:0o700});mkdirSync(join(directory,'responses'),{mode:0o700});durableJson(join(directory,'plan.json'),plan,true);
  durableJson(join(directory,'ledger.json'),{version:schemaVersion,planHash:plan.planHash,approval:null,status:'prepared',attempts:[],updatedAt:now()},true);registerCampaignRun(root,{name,planHash:plan.planHash,kind:'tool_rehearsal',maximumNanos:plan.policy.maximumNanos});return inspectToolRehearsal(root,name);
 });
}
export function inspectToolRehearsal(root:string,name:string){
 const directory=runDirectory(root,name),plan=readToolPlan(directory),ledger=readToolLedger(directory,plan);return {directory,planHash:plan.planHash,model:plan.policy.model,maximumUsd:plan.policy.maximumNanos/1e9,maximumCalls:9,status:ledger.status,attemptedCalls:ledger.attempts.length,accountedMaximumUsd:accounted(ledger)/1e9,scenarios:plan.scenarios.map((scenario,index)=>({id:scenario.id,role:scenario.role,attempts:ledger.attempts.filter(a=>a.packetIndex===index).length}))};
}
function toolPayload(body:string){
 const payload=z.object({model:z.literal('gpt-6.1-sol'),reasoning:z.object({effort:z.literal('high')}).strict(),input:z.array(item).min(1),instructions:z.string().optional(),tools:z.array(z.object({type:z.literal('function'),name:z.string().min(1),description:z.string().optional(),parameters:z.record(z.string(),z.unknown()),strict:z.boolean().optional()}).strict()),max_output_tokens:z.literal(4096),service_tier:z.literal('default'),store:z.literal(false),include:z.array(z.literal('reasoning.encrypted_content')),parallel_tool_calls:z.literal(false),tool_choice:z.literal('none').optional(),text:z.unknown().optional()}).strict().parse(parseBoundedJson(body,300000));
 const allowed=new Set(['message','input_text','output_text','refusal','reasoning','summary_text','reasoning_text','function_call','function_call_output']);
 function check(value:unknown):void{if(Array.isArray(value))return value.forEach(check);if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){if(key==='type'&&typeof child==='string'&&!allowed.has(child))throw err('Paid built-in tools, images, audio and files are outside this text rehearsal.');check(child);}}
 check(payload.input);return payload;
}
/** Trusted operator transport wrapper. It records usage but never invokes returned tools. */
export async function executeToolRehearsalRequest(root:string,name:string,approval:{planHash:string;maximumCents:number},input:{scenarioId:string;requestId:string;body:string},transport:EvaluationTransport):Promise<JsonItem>{
 root=resolve(root);return withLock(root,async()=>{assertNoUncertainty(root,name);const directory=runDirectory(root,name),plan=readToolPlan(directory,true),ledger=readToolLedger(directory,plan);
  if(approval.planHash!==plan.planHash||!Number.isSafeInteger(approval.maximumCents)||approval.maximumCents>999||approval.maximumCents*10_000_000<plan.policy.maximumNanos)throw err('Approve the exact tool rehearsal within the shared campaign cap.');
  if(!/^[A-Za-z0-9_.:-]{1,240}$/.test(input.requestId))throw err('A stable trusted request identity is required.');
  const packetIndex=plan.scenarios.findIndex(s=>s.id===input.scenarioId);if(packetIndex<0)throw err('This scenario is not in the reviewed plan.');
  const payload=toolPayload(input.body),id=`tool-${fileHash(input.requestId).slice(0,32)}`,requestHash=fileHash(input.body),prior=ledger.attempts.find(a=>a.id===id);
  if(prior){if(prior.requestHash!==requestHash||prior.packetIndex!==packetIndex||prior.status!=='completed')throw err('The earlier request differs or has an unresolved outcome; it will not be resent.');const response=readSavedResponse(directory,prior),receipt=validateReceipt(response,prior.inputCount,prior.model);if(receipt.value.status!=='completed'||receipt.overrun||receipt.value.id!==prior.responseId||receipt.accountedNanos!==prior.accountedNanos||hash(receipt.usage)!==hash(prior.usage))throw err('The saved receipt is inconsistent.');return response;}
  if(ledger.status==='completed'||ledger.status==='stopped'||ledger.attempts.some(a=>a.status!=='completed'))throw err('This tool rehearsal is completed, stopped or has unresolved usage.');
  const turn=ledger.attempts.filter(a=>a.packetIndex===packetIndex).length;if(turn>=3||ledger.attempts.length>=9)throw err('This rehearsal reached its fixed model-round limit.');
  if(ledger.approval&&(ledger.approval.planHash!==approval.planHash||ledger.approval.maximumCents!==approval.maximumCents))throw err('The approval differs from the saved whole-run decision.');
  assertCampaignAdmission(root,name);if(!ledger.approval)ledger.approval={...approval,recordedAt:now(),source:'explicit_operator_cli'};ledger.status='running';saveLedger(directory,ledger);
  const {max_output_tokens,service_tier,store,include,...countedPayload}=payload;void max_output_tokens;void service_tier;void store;void include;
  let inputCount:number;try{inputCount=await countedInput(directory,id,countedPayload,20_000,transport);delete ledger.lastCountFailure;}catch(error){const code=countFailure(directory,ledger,id,error);throw err(`Input counting stopped (${code}); no generation was sent. Inspect the private counts evidence.`);}
  const reservedNanos=price('gpt-6.1-sol',inputCount,4096);assertCampaignAdmission(root,name,reservedNanos);
  durableJson(join(directory,'requests',`${id}.json`),{body:input.body,requestHash,clientRequestId:input.requestId,inputCount,planHash:plan.planHash},true);
  const attempt:EvaluationAttempt={id,packetIndex,turn,model:'gpt-6.1-sol',status:'dispatching',requestHash,inputCount,reservedNanos,startedAt:now(),requestFile:`requests/${id}.json`};ledger.attempts.push(attempt);saveLedger(directory,ledger);const started=performance.now();
  try{
   const response=await transport.create(input.body,input.requestId);attempt.elapsedMs=Math.round(performance.now()-started);attempt.httpStatus=response.status;if(response.requestId&&/^[A-Za-z0-9_.:-]{1,200}$/.test(response.requestId))attempt.providerRequestId=response.requestId;
   const responseHash=fileHash(response.body);durableJson(join(directory,'responses',`${id}.json`),{status:response.status,body:response.body,responseHash,requestId:attempt.providerRequestId,elapsedMs:attempt.elapsedMs},true);attempt.responseHash=responseHash;attempt.responseFile=`responses/${id}.json`;
   if(response.status<200||response.status>=300){attempt.status=[400,401,403,404,429].includes(response.status)?'rejected':'unknown';if(attempt.status==='rejected')attempt.accountedNanos=0;throw err('Provider HTTP failure.');}
   const receipt=validateReceipt(parseBoundedJson(response.body,2_000_000),inputCount,'gpt-6.1-sol');attempt.responseId=receipt.value.id;attempt.usage=receipt.usage;attempt.accountedNanos=receipt.accountedNanos;
   if(ledger.attempts.some(other=>other.id!==id&&other.responseId===receipt.value.id))throw err('Repeated response identity.');
   if(receipt.overrun){attempt.status='usage_overrun';throw err('Usage overrun.');}if(receipt.value.status!=='completed'){attempt.status='incomplete';throw err('Incomplete response.');}
   if(receipt.value.output.some(value=>!['reasoning','message','function_call'].includes(String(value.type))||value.type!=='reasoning'&&value.status!==undefined&&value.status!=='completed')){attempt.status='invalid_output';throw err('Unsupported provider output.');}
   attempt.status='completed';attempt.finishedAt=now();saveLedger(directory,ledger);return receipt.value;
  }catch{if(attempt.status==='dispatching'){attempt.status='unknown';delete attempt.usage;delete attempt.accountedNanos;}attempt.finishedAt=now();attempt.failure='provider_or_receipt_failure';ledger.status='stopped';saveLedger(directory,ledger);throw err('The tool rehearsal stopped with saved evidence. No automatic provider retry was made.');}
 });
}
export function finishToolRehearsal(root:string,name:string,planHash:string){return withLock(resolve(root),()=>{const directory=runDirectory(root,name),plan=readToolPlan(directory),ledger=readToolLedger(directory,plan);if(plan.planHash!==planHash||ledger.attempts.some(a=>a.status!=='completed')||plan.scenarios.some((_,index)=>!ledger.attempts.some(a=>a.packetIndex===index)))throw err('Only a verified run with all three scenarios and no unresolved calls can be closed.');ledger.status='completed';saveLedger(directory,ledger);return inspectToolRehearsal(root,name);});}

/** One fixed, operator-owned comparison; its mutable bodies come only from the frozen application harness. */
export const workflowComparisonPolicy={model:'gpt-6.1-sol',reasoning:'high',serviceTier:'default',maxInputTokens:30_000,maxOutputTokens:4096,maximumCalls:40,maximumNanos:40*(30_000*5_000+4096*10_000),prerequisitePolicy:'skip_second_turn_only_when_required_first_turn_artifact_is_unavailable'} as const;
export interface WorkflowComparisonSlot {id:string;role:'dispositions'|'acquisitions'|'manager';arm:'guided'|'generic';turn:0|1;conversationId:string;employeeRequestId:string;request:string;maxCalls:3|4}
export interface WorkflowComparisonBindings {campaignId:string;fixtureHash:string;sourceHash:string;runtimeHash:string}
interface WorkflowComparisonPlan {version:number;kind:'workflow_comparison';runId:string;createdAt:string;applicationRevision:string;runnerSourceHash:string;policy:typeof workflowComparisonPolicy;bindings:WorkflowComparisonBindings;slots:WorkflowComparisonSlot[];planHash:string}
export interface WorkflowComparisonOutcome {slotId:string;status:'completed'|'quality_failed'|'prerequisite_skipped';evidenceHash:string;reason?:string}
interface WorkflowComparisonLedger extends EvaluationLedger {outcomes:(WorkflowComparisonOutcome&{recordedAt:string})[]}
const identity=z.string().regex(/^[A-Za-z0-9_.:-]{1,240}$/),digestSchema=z.string().regex(/^[a-f0-9]{64}$/);
const workflowBindingsSchema=z.object({campaignId:z.string().uuid(),fixtureHash:digestSchema,sourceHash:digestSchema,runtimeHash:digestSchema}).strict();
const workflowSlotSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),role:z.enum(['dispositions','acquisitions','manager']),arm:z.enum(['guided','generic']),turn:z.union([z.literal(0),z.literal(1)]),conversationId:identity,employeeRequestId:identity,request:z.string().trim().min(1).max(12000),maxCalls:z.union([z.literal(3),z.literal(4)])}).strict();
const workflowOutcomeSchema=z.object({slotId:workflowSlotSchema.shape.id,status:z.enum(['completed','quality_failed','prerequisite_skipped']),evidenceHash:digestSchema,reason:z.string().trim().min(1).max(1000).optional()}).strict();
const workflowRequestSchema=z.object({planHash:digestSchema,slotId:workflowSlotSchema.shape.id,conversationId:identity,employeeRequestId:identity,renderedRequest:z.string().min(1).max(20000),renderedRequestHash:digestSchema}).strict();
function readWorkflowRequest(directory:string,plan:WorkflowComparisonPlan,slot:WorkflowComparisonSlot){
 const saved=workflowRequestSchema.parse(readJson(join(directory,'turns',`${slot.id}.json`)));
 if(saved.planHash!==plan.planHash||saved.slotId!==slot.id||saved.conversationId!==slot.conversationId||saved.employeeRequestId!==slot.employeeRequestId||saved.renderedRequestHash!==fileHash(saved.renderedRequest))throw err('The rendered employee request binding changed.');return saved;
}
function latestUserRequest(payload:ReturnType<typeof toolPayload>){
 const latest=payload.input.filter(value=>value.role==='user').at(-1);if(typeof latest?.content==='string')return latest.content;
 if(Array.isArray(latest?.content)&&latest.content.every(value=>value&&typeof value==='object'&&(value as JsonItem).type==='input_text'&&typeof (value as JsonItem).text==='string'))return latest.content.map(value=>(value as JsonItem).text).join('');
 throw err('The workflow request must retain its current employee text.');
}
function workflowSlots(value:unknown):WorkflowComparisonSlot[]{
 const slots=z.array(workflowSlotSchema).length(12).parse(value),seen=new Set<string>();
 if(new Set(slots.map(s=>s.id)).size!==12||new Set(slots.map(s=>s.employeeRequestId)).size!==12)throw err('Workflow slots and original employee requests must be globally distinct across both arms.');
 for(const slot of slots){const key=`${slot.role}:${slot.arm}:${slot.turn}`;if(seen.has(key)||slot.maxCalls!==(slot.role==='dispositions'?4:3))throw err('The fixed role/arm/turn call limits changed.');seen.add(key);
  const own=slots.find(s=>s.role===slot.role&&s.arm===slot.arm&&s.turn!==slot.turn),paired=slots.find(s=>s.role===slot.role&&s.arm!==slot.arm&&s.turn===slot.turn);
  if(!own||own.conversationId!==slot.conversationId||!paired||paired.request!==slot.request||slots.some(s=>s.arm===slot.arm&&s.role!==slot.role&&s.conversationId===slot.conversationId))throw err('Each arm must retain its own role conversation and equal employee request templates.');
 }
 return slots;
}
function readWorkflowPlan(directory:string,dispatch=false):WorkflowComparisonPlan {
 const raw=readJson(join(directory,'plan.json')) as WorkflowComparisonPlan;if(!raw||typeof raw!=='object')throw err('Workflow comparison plan is missing.');const {planHash,...value}=raw;
 if(raw.version!==schemaVersion||raw.kind!=='workflow_comparison'||hash(value)!==planHash||hash(raw.policy)!==hash(workflowComparisonPolicy)||!/^[a-f0-9]{40}$/.test(raw.applicationRevision)||dispatch&&raw.runnerSourceHash!==runnerSourceHash())throw err('The workflow comparison plan changed or is invalid.');
 workflowBindingsSchema.parse(raw.bindings);workflowSlots(raw.slots);return raw;
}
function previousWorkflowSlot(plan:WorkflowComparisonPlan,slot:WorkflowComparisonSlot){return plan.slots.find(s=>s.role===slot.role&&s.arm===slot.arm&&s.turn===0)!;}
function validateWorkflowOutcome(plan:WorkflowComparisonPlan,ledger:WorkflowComparisonLedger,outcome:WorkflowComparisonOutcome){
 workflowOutcomeSchema.parse(outcome);const index=plan.slots.findIndex(s=>s.id===outcome.slotId),slot=plan.slots[index];if(!slot)throw err('Unknown workflow outcome slot.');
 const attempts=ledger.attempts.filter(a=>a.packetIndex===index),previous=slot.turn===1?ledger.outcomes.find(o=>o.slotId===previousWorkflowSlot(plan,slot).id):undefined;
 if(attempts.some(a=>a.status!=='completed')||slot.turn===1&&!previous)throw err('A workflow outcome cannot hide unresolved usage or precede its own first turn.');
 if(outcome.status==='completed'&&!attempts.length)throw err('A completed workflow turn requires a saved provider receipt.');
 if(outcome.status!=='completed'&&!outcome.reason)throw err('A failed or skipped quality outcome requires its evidence reason.');
 if(outcome.status==='prerequisite_skipped'&&(slot.turn!==1||previous?.status!=='quality_failed'||attempts.length))throw err('Only an unattempted second turn with a failed first-turn prerequisite may be skipped.');
}
function readWorkflowLedger(directory:string,plan:WorkflowComparisonPlan):WorkflowComparisonLedger {
 const raw=readJson(join(directory,'ledger.json')) as WorkflowComparisonLedger;
 if(!raw||raw.version!==schemaVersion||raw.planHash!==plan.planHash||!Array.isArray(raw.attempts)||raw.attempts.length>40||!Array.isArray(raw.outcomes)||raw.outcomes.length>12||!['prepared','running','paused','completed','stopped'].includes(raw.status)||new Set(raw.attempts.map(a=>a.id)).size!==raw.attempts.length||new Set(raw.outcomes.map(o=>o.slotId)).size!==raw.outcomes.length)throw err('Workflow comparison accounting is invalid.');
 const counts=Array<number>(12).fill(0),responseIds=new Set<string>();
 for(const attempt of raw.attempts){const slot=plan.slots[attempt.packetIndex];
  if(!slot||!Number.isInteger(attempt.packetIndex)||!/^workflow-[a-f0-9]{32}$/.test(attempt.id)||attempt.turn!==counts[attempt.packetIndex]++||attempt.turn>=slot.maxCalls||attempt.model!=='gpt-6.1-sol'||!safeCount.safeParse(attempt.inputCount).success||attempt.inputCount>30_000||attempt.reservedNanos!==price(attempt.model,attempt.inputCount,4096)||!['dispatching','completed','incomplete','rejected','unknown','invalid_output','usage_overrun'].includes(attempt.status)||attempt.accountedNanos!==undefined&&(!Number.isSafeInteger(attempt.accountedNanos)||attempt.accountedNanos<0))throw err('A saved workflow dispatch claim is invalid.');
  if(attempt.responseId){if(responseIds.has(attempt.responseId))throw err('A workflow provider receipt identity was reused.');responseIds.add(attempt.responseId);}
 }
 if(raw.approval&&(raw.approval.planHash!==plan.planHash||raw.approval.maximumCents!==999))throw err('The workflow campaign approval changed.');
 const checked:WorkflowComparisonLedger={...raw,outcomes:[]};for(const saved of raw.outcomes){const {recordedAt,...outcome}=saved;if(typeof recordedAt!=='string'||!Number.isFinite(Date.parse(recordedAt)))throw err('Workflow outcome evidence is invalid.');validateWorkflowOutcome(plan,checked,outcome);checked.outcomes.push(saved);}
 if(raw.status==='completed'&&(raw.outcomes.length!==12||raw.attempts.some(a=>a.status!=='completed')))throw err('A completed workflow comparison requires all twelve terminal outcomes and settled receipts.');
 for(const attempt of raw.attempts){const saved=readJson(join(directory,'requests',`${attempt.id}.json`)) as {clientRequestId:string;planHash:string;slotId:string;conversationId:string;employeeRequestId:string;inputCount:number};const slot=plan.slots[attempt.packetIndex];
  if(!identity.safeParse(saved.clientRequestId).success||attempt.id!==`workflow-${fileHash(saved.clientRequestId).slice(0,32)}`||saved.planHash!==plan.planHash||saved.slotId!==slot.id||saved.conversationId!==slot.conversationId||saved.employeeRequestId!==slot.employeeRequestId||saved.inputCount!==attempt.inputCount)throw err('The saved workflow request binding changed.');
  const binding=readWorkflowRequest(directory,plan,slot),payload=toolPayload(JSON.stringify(readSavedRequest(directory,attempt)));if(latestUserRequest(payload)!==binding.renderedRequest)throw err('The saved provider body no longer matches this turn\'s rendered employee request.');if(attempt.status==='completed')verifiedCompletedReceipt(directory,attempt);
 }
 return raw;
}
function workflowCampaign(root:string,campaignId:string){
 if(!existsSync(campaignFile(root)))throw err('The original shared campaign is required; missing evidence is not a new budget.');
 const campaign=readCampaign(root);if(campaign.id!==campaignId)throw err('The original workflow campaign identity changed.');return campaign;
}
export function prepareWorkflowComparison(root:string,name:string,applicationRevision:string,slots:WorkflowComparisonSlot[],bindings:WorkflowComparisonBindings){
 if(!/^[a-f0-9]{40}$/.test(applicationRevision))throw err('Freeze the exact application commit.');slots=workflowSlots(slots);bindings=workflowBindingsSchema.parse(bindings);
 root=resolve(root);return withLock(root,()=>{workflowCampaign(root,bindings.campaignId);assertNoUncertainty(root);const directory=runDirectory(root,name);if(existsSync(directory))throw err('That run already exists. Evidence cannot be overwritten.');assertCampaignCapacity(root,workflowComparisonPolicy.maximumNanos);
  const value={version:schemaVersion,kind:'workflow_comparison' as const,runId:randomUUID(),createdAt:now(),applicationRevision,runnerSourceHash:runnerSourceHash(),policy:structuredClone(workflowComparisonPolicy),bindings,slots},plan:WorkflowComparisonPlan={...value,planHash:hash(value)};
  mkdirSync(directory,{mode:0o700});mkdirSync(join(directory,'requests'),{mode:0o700});mkdirSync(join(directory,'responses'),{mode:0o700});mkdirSync(join(directory,'turns'),{mode:0o700});durableJson(join(directory,'plan.json'),plan,true);
  durableJson(join(directory,'ledger.json'),{version:schemaVersion,planHash:plan.planHash,approval:null,status:'prepared',attempts:[],outcomes:[],updatedAt:now()},true);registerCampaignRun(root,{name,planHash:plan.planHash,kind:'workflow_comparison',maximumNanos:plan.policy.maximumNanos});return inspectWorkflowComparison(root,name);
 });
}
export function inspectWorkflowComparison(root:string,name:string){
 const directory=runDirectory(root,name),plan=readWorkflowPlan(directory);workflowCampaign(resolve(root),plan.bindings.campaignId);const ledger=readWorkflowLedger(directory,plan);
 return {directory,planHash:plan.planHash,applicationRevision:plan.applicationRevision,bindings:plan.bindings,model:plan.policy.model,maximumUsd:plan.policy.maximumNanos/1e9,maximumCalls:plan.policy.maximumCalls,status:ledger.status,attemptedCalls:ledger.attempts.length,accountedMaximumUsd:accounted(ledger)/1e9,outcomes:ledger.outcomes,slots:plan.slots.map((slot,index)=>({...slot,attempts:ledger.attempts.filter(a=>a.packetIndex===index).length})),unresolved:ledger.attempts.filter(a=>['dispatching','unknown'].includes(a.status)).map(a=>a.id)};
}
/** Application bodies vary with real local tool results; identities, limits and the frozen harness do not. */
export async function executeWorkflowComparisonRequest(root:string,name:string,approval:{planHash:string;maximumCents:number},input:{slotId:string;conversationId:string;employeeRequestId:string;renderedRequest:string;requestId:string;body:string},transport:EvaluationTransport):Promise<JsonItem>{
 root=resolve(root);return withLock(root,async()=>{const directory=runDirectory(root,name),plan=readWorkflowPlan(directory,true);workflowCampaign(root,plan.bindings.campaignId);assertNoUncertainty(root,name);const ledger=readWorkflowLedger(directory,plan);
  if(approval.planHash!==plan.planHash||approval.maximumCents!==999)throw err('Use the exact workflow plan and original 999-cent campaign authorization.');
  const packetIndex=plan.slots.findIndex(s=>s.id===input.slotId),slot=plan.slots[packetIndex];if(!slot||input.conversationId!==slot.conversationId||input.employeeRequestId!==slot.employeeRequestId||!identity.safeParse(input.requestId).success)throw err('The request is outside its frozen role, arm, turn or conversation.');
  const payload=toolPayload(input.body),binding=workflowRequestSchema.parse({planHash:plan.planHash,slotId:slot.id,conversationId:slot.conversationId,employeeRequestId:slot.employeeRequestId,renderedRequest:input.renderedRequest,renderedRequestHash:fileHash(input.renderedRequest)});if(latestUserRequest(payload)!==binding.renderedRequest)throw err('The current employee message differs from the rendered workflow request.');
  const bindingPath=join(directory,'turns',`${slot.id}.json`);if(existsSync(bindingPath)&&hash(readWorkflowRequest(directory,plan,slot))!==hash(binding))throw err('This turn\'s rendered request changed after its first dispatch.');
  const id=`workflow-${fileHash(input.requestId).slice(0,32)}`,requestHash=fileHash(input.body),prior=ledger.attempts.find(a=>a.id===id);
  if(prior){if(prior.requestHash!==requestHash||prior.packetIndex!==packetIndex||prior.status!=='completed')throw err('The earlier workflow request differs or has an unresolved outcome; it will not be resent.');readSavedRequest(directory,prior);return verifiedCompletedReceipt(directory,prior);}
  if(ledger.status==='completed'||ledger.status==='stopped'||ledger.attempts.some(a=>a.status!=='completed')||ledger.outcomes.some(o=>o.slotId===slot.id))throw err('This workflow run or turn is closed or contains unresolved usage.');
  if(slot.turn===1&&!ledger.outcomes.some(o=>o.slotId===previousWorkflowSlot(plan,slot).id))throw err('Complete and record this arm\'s first turn before its continuation.');
  const turn=ledger.attempts.filter(a=>a.packetIndex===packetIndex).length;if(turn>=slot.maxCalls||ledger.attempts.length>=40)throw err('This workflow reached its fixed model-round limit.');
  assertCampaignAdmission(root,name);if(!existsSync(bindingPath))durableJson(bindingPath,binding,true);if(!ledger.approval)ledger.approval={...approval,recordedAt:now(),source:'explicit_operator_cli'};ledger.status='running';saveLedger(directory,ledger);
  const {max_output_tokens,service_tier,store,include,...countedPayload}=payload;void max_output_tokens;void service_tier;void store;void include;
  let inputCount:number;try{inputCount=await countedInput(directory,id,countedPayload,30_000,transport);delete ledger.lastCountFailure;}catch(error){const code=countFailure(directory,ledger,id,error);throw err(`Input counting stopped (${code}); no generation was sent. Inspect the private counts evidence.`);}
  const reservedNanos=price('gpt-6.1-sol',inputCount,4096);assertCampaignAdmission(root,name,reservedNanos);
  durableJson(join(directory,'requests',`${id}.json`),{body:input.body,requestHash,clientRequestId:input.requestId,inputCount,planHash:plan.planHash,slotId:slot.id,conversationId:slot.conversationId,employeeRequestId:slot.employeeRequestId},true);
  const attempt:EvaluationAttempt={id,packetIndex,turn,model:'gpt-6.1-sol',status:'dispatching',requestHash,inputCount,reservedNanos,startedAt:now(),requestFile:`requests/${id}.json`};ledger.attempts.push(attempt);saveLedger(directory,ledger);const started=performance.now();
  try{
   const response=await transport.create(input.body,input.requestId);attempt.elapsedMs=Math.round(performance.now()-started);attempt.httpStatus=response.status;if(response.requestId&&/^[A-Za-z0-9_.:-]{1,200}$/.test(response.requestId))attempt.providerRequestId=response.requestId;
   const responseHash=fileHash(response.body);durableJson(join(directory,'responses',`${id}.json`),{status:response.status,body:response.body,responseHash,requestId:attempt.providerRequestId,elapsedMs:attempt.elapsedMs},true);attempt.responseHash=responseHash;attempt.responseFile=`responses/${id}.json`;
   if(response.status<200||response.status>=300){attempt.status=[400,401,403,404,429].includes(response.status)?'rejected':'unknown';if(attempt.status==='rejected')attempt.accountedNanos=0;throw err('Provider HTTP failure.');}
   const receipt=validateReceipt(parseBoundedJson(response.body,2_000_000),inputCount,'gpt-6.1-sol');
   if(ledger.attempts.some(other=>other.id!==id&&other.responseId===receipt.value.id))throw err('Repeated response identity.');
   attempt.responseId=receipt.value.id;attempt.usage=receipt.usage;attempt.accountedNanos=receipt.accountedNanos;
   if(receipt.overrun){attempt.status='usage_overrun';throw err('Usage overrun.');}if(receipt.value.status!=='completed'){attempt.status='incomplete';throw err('Incomplete response.');}
   if(receipt.value.output.some(value=>!['reasoning','message','function_call'].includes(String(value.type))||value.type!=='reasoning'&&value.status!==undefined&&value.status!=='completed')){attempt.status='invalid_output';throw err('Unsupported provider output.');}
   attempt.status='completed';attempt.finishedAt=now();saveLedger(directory,ledger);return receipt.value;
  }catch{if(attempt.status==='dispatching'){attempt.status='unknown';delete attempt.usage;delete attempt.accountedNanos;}attempt.finishedAt=now();attempt.failure='provider_or_receipt_failure';ledger.status='stopped';saveLedger(directory,ledger);throw err('The workflow comparison stopped with saved evidence. No automatic provider retry was made.');}
 });
}
export function recordWorkflowComparisonOutcome(root:string,name:string,planHash:string,input:WorkflowComparisonOutcome){
 return withLock(resolve(root),()=>{const directory=runDirectory(root,name),plan=readWorkflowPlan(directory);workflowCampaign(resolve(root),plan.bindings.campaignId);const ledger=readWorkflowLedger(directory,plan),outcome=workflowOutcomeSchema.parse(input);if(planHash!==plan.planHash)throw err('The workflow outcome belongs to a different plan.');
  const prior=ledger.outcomes.find(o=>o.slotId===outcome.slotId);if(prior){const {recordedAt,...saved}=prior;void recordedAt;if(hash(saved)!==hash(outcome))throw err('The immutable workflow outcome changed.');return inspectWorkflowComparison(root,name);}
  if(ledger.status==='completed'||ledger.status==='stopped'||ledger.attempts.some(a=>a.status!=='completed'))throw err('An outcome cannot close stopped or unresolved provider work.');validateWorkflowOutcome(plan,ledger,outcome);ledger.outcomes.push({...outcome,recordedAt:now()});saveLedger(directory,ledger);return inspectWorkflowComparison(root,name);
 });
}
export function finishWorkflowComparison(root:string,name:string,planHash:string){
 return withLock(resolve(root),()=>{const directory=runDirectory(root,name),plan=readWorkflowPlan(directory);workflowCampaign(resolve(root),plan.bindings.campaignId);const ledger=readWorkflowLedger(directory,plan);
  if(plan.planHash!==planHash||ledger.status==='stopped'||ledger.outcomes.length!==12||ledger.attempts.some(a=>a.status!=='completed'))throw err('Only twelve terminal workflow outcomes with settled provider receipts can close this plan.');ledger.status='completed';saveLedger(directory,ledger);return inspectWorkflowComparison(root,name);
 });
}
export async function runEvaluation(root:string,name:string,approval:{planHash:string;maximumCents:number;throughSample?:1|2},transport:EvaluationTransport){
 root=resolve(root);return withLock(root,async()=>{
  assertNoUncertainty(root,name);const directory=runDirectory(root,name),plan=readPlan(directory,true),ledger=readLedger(directory,plan);
  if(approval.planHash!==plan.planHash||!Number.isSafeInteger(approval.maximumCents)||approval.maximumCents>campaignMaximumCents||approval.maximumCents*10_000_000<plan.policy.maximumNanos)throw err('Explicit approval must match this exact plan, cover its complete maximum and remain within the $9.99 campaign cap before any provider call.');
  if(approval.throughSample!==undefined&&![1,2].includes(approval.throughSample))throw err('Choose sample 1 or 2.');
  if(ledger.approval&&(ledger.approval.planHash!==approval.planHash||ledger.approval.maximumCents!==approval.maximumCents))throw err('The approval differs from the original saved whole-run decision.');
  if(ledger.status==='stopped'||ledger.attempts.some(attempt=>attempt.status!=='completed'))throw err('This run has stopped or contains an unresolved/unsuccessful provider call. It cannot be automatically repeated.');
  assertCampaignAdmission(root,name);
  if(!ledger.approval){ledger.approval={planHash:approval.planHash,maximumCents:approval.maximumCents,recordedAt:now(),source:'explicit_operator_cli'};saveLedger(directory,ledger);}
  const limit=approval.throughSample??2;ledger.status='running';saveLedger(directory,ledger);
  for(let packetIndex=0;packetIndex<plan.packets.length;packetIndex++)for(let turn=0;turn<2;turn++){
   if(plan.packets[packetIndex].sample>limit)continue;const id=attemptId(packetIndex,turn),prior=ledger.attempts.find(attempt=>attempt.id===id);
   if(prior){readSavedRequest(directory,prior);completedResponse(directory,prior);if(fileHash(JSON.stringify(buildPayload(plan,packetIndex,turn,directory,ledger)))!==prior.requestHash)throw err('The saved request differs from the frozen packet and its own preceding answer.');continue;}
   if(ledger.attempts.length>=maximumCalls)throw err('The fixed whole-run call limit has been reached.');
   const payload=buildPayload(plan,packetIndex,turn,directory,ledger),body=JSON.stringify(payload);if(Buffer.byteLength(body)>300000)throw err('The advisory request exceeds its supported text bound. No generation was sent.');
   let inputCount:number;
   try{inputCount=await countedInput(directory,id,countPayload(payload),tokenCap,transport);delete ledger.lastCountFailure;}
   catch(error){const code=countFailure(directory,ledger,id,error);throw err(`Input counting stopped (${code}); no generation was sent. Inspect the private counts evidence.`);}
   const reservedNanos=price(payload.model,inputCount,outputCap);
   if(accounted(ledger)+reservedNanos>ledger.approval.maximumCents*10_000_000)throw err('The next request would exceed the approved whole-run cap. No generation was sent.');
   assertCampaignAdmission(root,name,reservedNanos);
   const requestHash=fileHash(body),requestFile=`requests/${id}.json`;
   durableJson(join(directory,requestFile),{body,requestHash,clientRequestId:`evaluation-${plan.runId}-${id}`,inputCount,planHash:plan.planHash},true);
   const attempt:EvaluationAttempt={id,packetIndex,turn,model:payload.model,status:'dispatching',requestHash,inputCount,reservedNanos,startedAt:now(),requestFile};ledger.attempts.push(attempt);saveLedger(directory,ledger);
   const started=performance.now();
   try{
    const response=await transport.create(body,`evaluation-${plan.runId}-${id}`);attempt.elapsedMs=Math.round(performance.now()-started);attempt.httpStatus=response.status;
    if(response.requestId&&/^[A-Za-z0-9_.:-]{1,200}$/.test(response.requestId))attempt.providerRequestId=response.requestId;
    const responseHash=fileHash(response.body),responseFile=`responses/${id}.json`;
    // Raw body is private evidence, never printed to the console or given to graders.
    durableJson(join(directory,responseFile),{status:response.status,body:response.body,responseHash,requestId:attempt.providerRequestId,elapsedMs:attempt.elapsedMs},true);attempt.responseFile=responseFile;attempt.responseHash=responseHash;
    if(response.status<200||response.status>=300){attempt.status=[400,401,403,404,429].includes(response.status)?'rejected':'unknown';attempt.failure='provider_http_failure';if(attempt.status==='rejected')attempt.accountedNanos=0;ledger.status='stopped';saveLedger(directory,ledger);throw err('Provider request failed; this run stopped without a retry.');}
    const raw=parseBoundedJson(response.body,2_000_000),receipt=validateReceipt(raw,inputCount,payload.model);attempt.responseId=receipt.value.id;attempt.usage=receipt.usage;attempt.accountedNanos=receipt.accountedNanos;
    if(ledger.attempts.some(other=>other.id!==id&&other.responseId===receipt.value.id))throw err('Provider response identity was reused.');
    if(receipt.overrun){attempt.status='usage_overrun';attempt.failure='usage_exceeded_bound';}
    else if(receipt.value.status!=='completed'){attempt.status='incomplete';attempt.failure='noncompleted_response';}
    else{try{validateOutput(receipt.value);attempt.status='completed';}catch{attempt.status='invalid_output';attempt.failure='unsupported_or_missing_final_answer';}}
    attempt.finishedAt=now();if(attempt.status!=='completed')ledger.status='stopped';saveLedger(directory,ledger);
    if(attempt.status!=='completed')throw err('The response was incomplete, unsupported or exceeded its bound. Evidence was saved; no further generation was sent.');
   }catch{
    if(attempt.status==='dispatching'){attempt.status='unknown';delete attempt.accountedNanos;delete attempt.usage;attempt.failure='connection_receipt_or_persistence_unresolved';attempt.elapsedMs=Math.round(performance.now()-started);attempt.finishedAt=now();ledger.status='stopped';saveLedger(directory,ledger);}
    publishBlindAnswers(directory,plan,ledger);throw err('The evaluation stopped. Inspect its saved status and private evidence; no automatic retry or further provider call was made.');
   }
   publishBlindAnswers(directory,plan,ledger);
  }
  ledger.status=ledger.attempts.length===maximumCalls?'completed':'paused';saveLedger(directory,ledger);publishBlindAnswers(directory,plan,ledger);return inspectEvaluation(root,name);
 });
}

export function defaultEvaluationRoot(){return resolve('artifacts','specialist-evaluations');}
