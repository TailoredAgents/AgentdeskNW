import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor, ResearchInput } from '../src/lib/contracts';
import { closeDb, demoActor, getDb, now } from '../src/server/db';
import { billingPolicy, saveBillingPolicy } from '../src/server/billing';
import { grantLegacyTestWorkforce } from './fixtures';
import { cancelJob, createResearchJob, getResearchJob, listJobs, processQueuedJobs, retryJob } from '../src/server/services';
import { processExternalResearchJobs } from '../src/server/external-research-worker';
import { parseResearchResponse } from '../src/server/external-research-provider';
import { beginProviderOperation, providerOperations } from '../src/server/provider-runtime';
import { reserveUsage, usageBalances } from '../src/server/metering';

let actor:Actor;
const input:ResearchInput={address:'123 Example Street, Marietta, GA',county:'Cobb',propertyType:'Single-family',price:235000,strategy:'Fix & flip',limit:5,provider:'openai-web-search-v1',maxCostCents:200};
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const candidate=(company='Example Business LLC',suffix='one')=>({company,county:'Cobb',strategy:'Fix & flip',propertyType:'Single-family',phone:null,contactSourceUrl:null,evidence:[{url:`https://business.example/${suffix}`,title:'Business acquisition report',detail:'The business reports an acquisition; independent verification is required.',kind:'reported_transaction',transactionDate:'2026-10-01',price:225000,propertyAddress:'100 Public Example Lane',propertyType:'Single-family'}]});
function response(id='resp-one',candidates:unknown[]=[candidate()],options:{missingUsage?:boolean;searchCount?:number;malformed?:boolean}={}){
 return {id,status:'completed',...(!options.missingUsage?{usage:{input_tokens:100,output_tokens:200}}:{}),output:[...Array.from({length:options.searchCount??1},(_,n)=>({type:'web_search_call',id:`search-${n}`,status:'completed',action:{type:'search',sources:[{type:'url',url:'https://business.example/one'},{type:'url',url:'https://business.example/two'}]}})),{type:'message',content:[{type:'output_text',text:options.malformed?'invalid output':JSON.stringify({candidates}),annotations:[{type:'url_citation',url:'https://business.example/one',title:'Business source'}]}]}]};
}
const reply=(body= response())=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
const balance=(category:string)=>usageBalances(actor).find(b=>b.category===category)!;
const tick=()=>processExternalResearchJobs(actor);
beforeEach(()=>{
 closeDb();process.env.AGENTDESK_DB_PATH=':memory:';process.env.AGENTDESK_DEMO='true';process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO='true';
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T14:00:00Z'));
 vi.stubEnv('OPENAI_API_KEY','test-only-key');vi.stubEnv('AGENTDESK_RESEARCH_PROVIDER','openai-web-search-v1');vi.stubEnv('AGENTDESK_RESEARCH_ESTIMATED_REQUEST_CENTS','50');vi.stubEnv('AGENTDESK_RESEARCH_MAX_CALLS','2');vi.stubEnv('AGENTDESK_RESEARCH_MIN_INTERVAL_MS','0');
 actor=demoActor();grantLegacyTestWorkforce();vi.stubGlobal('fetch',vi.fn(async()=>reply()));
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('external evidence normalization',()=>{
 it('preserves public source references without claiming verified purchases or contacts',()=>{
  const result=parseResearchResponse(response(),input);expect(result.prospects).toHaveLength(1);expect(result).toMatchObject({inputTokens:100,outputTokens:200,searchCalls:1});
  expect(result.prospects[0]).toMatchObject({synthetic:false,identityStatus:'unverified',transactionStatus:'unverified',contactStatus:'missing',typicalPrice:225000,transactionCount:1});
  expect(result.prospects[0].evidence[0]).toMatchObject({url:'https://business.example/one',confidence:'unverified',transactionDate:'2026-10-01'});expect(result.prospects[0].score).toBeLessThan(60);
 });
 it('rejects invented URLs, missing searches, malformed candidates and unsafe links',()=>{
  const unsupported=candidate();unsupported.evidence[0].url='https://invented.example';
  expect(parseResearchResponse(response('r',[unsupported]),input).prospects).toHaveLength(0);
  expect(parseResearchResponse(response('r',[candidate()],{searchCount:0}),input).prospects).toHaveLength(0);
  expect(parseResearchResponse(response('r',[{...candidate(),synthetic:true}]),input).prospects).toHaveLength(0);
  unsupported.evidence[0].url='javascript:alert(1)';expect(parseResearchResponse(response('r',[unsupported]),input).prospects).toHaveLength(0);
 });
 it('keeps unknown purchase facts at zero relevance and never equates research date with activity',()=>{
  const raw={...candidate(),evidence:[{...candidate().evidence[0],kind:'business_profile',transactionDate:null,price:null,propertyAddress:null}]};
  const prospect=parseResearchResponse(response('r',[raw]),input).prospects[0];expect(prospect).toMatchObject({typicalPrice:0,transactionCount:0,lastActivityAt:'',transactionStatus:'not_found'});expect(prospect.scoreBreakdown).toMatchObject({price:0,propertyType:0,recency:0,activity:0});
 });
 it('requires a cited business contact claim and keeps its association unverified',()=>{
  const raw={...candidate(),phone:'+1 404 555 0100',contactSourceUrl:'https://business.example/one'};
  expect(parseResearchResponse(response('r',[raw]),input).prospects[0].phone).toBeNull();
  raw.evidence.push({...candidate().evidence[0],kind:'contact',detail:'Public business contact: +1 404 555 0100'});
  expect(parseResearchResponse(response('r',[raw]),input).prospects[0]).toMatchObject({phone:'+1 404 555 0100',contactStatus:'unverified',contactSourceUrl:'https://business.example/one'});
 });
});

describe('external research authorization and durable execution',()=>{
 it('requires explicit provider setup, per-job budget and property scope without falling back',()=>{
  expect(()=>createResearchJob(actor,{...input,maxCostCents:undefined})).toThrow('explicit');expect(()=>createResearchJob(actor,{...input,propertyType:undefined})).toThrow('property type');
  vi.stubEnv('OPENAI_API_KEY','');expect(()=>createResearchJob(actor,input)).toThrow('disconnected');expect(listJobs(actor)).toHaveLength(0);
  expect(createResearchJob(actor,{...input,provider:'synthetic-fixtures-v1'}).provider).toBe('synthetic-fixtures-v1');expect(fetch).not.toHaveBeenCalled();
 });
 it('separates synthetic ticks, runs network outside transactions and captures actual receipts',async()=>{
  const request=vi.mocked(fetch).mockImplementation(async(_url,options)=>{expect(getDb().inTransaction).toBe(false);const body=JSON.parse(String(options!.body));expect(body).toMatchObject({store:false,tool_choice:'required',max_tool_calls:2,include:['web_search_call.action.sources']});expect(JSON.stringify(body)).not.toContain('Private fictional acquisition');return reply();});
  const job=createResearchJob(actor,{...input,limit:1});expect(processQueuedJobs(actor)).toBe(0);expect(fetch).not.toHaveBeenCalled();await tick();
  expect(getResearchJob(actor,job.id)).toMatchObject({status:'completed',external:{providerRequests:1,searchCalls:1,inputTokens:100,outputTokens:200,estimatedCostCents:50}});
  expect(balance('research_credits')).toMatchObject({consumed:1,reserved:0});expect(balance('external_search').consumed).toBe(1);expect(providerOperations(actor)[0]).toMatchObject({status:'succeeded',actualCostCents:null,estimatedCostCents:50,usage:{input_tokens:100,output_tokens:200,web_search_calls:1}});
  await tick();expect(request).toHaveBeenCalledTimes(1);
 });
 it('retains partial results across known failure and retries without repeating external calls',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(reply()).mockResolvedValueOnce(new Response('{}',{status:429}));
  const job=createResearchJob(actor,input);await tick();expect(getResearchJob(actor,job.id)).toMatchObject({status:'running',prospects:[{company:'Example Business LLC'}]});await tick();
  expect(getResearchJob(actor,job.id)).toMatchObject({status:'failed',prospects:[{company:'Example Business LLC'}]});expect(balance('research_credits').reserved).toBe(0);
  retryJob(actor,job.id);await tick();expect(getResearchJob(actor,job.id).status).toBe('completed');expect(fetch).toHaveBeenCalledTimes(2);expect(balance('research_credits').consumed).toBe(1);expect(providerOperations(actor)).toHaveLength(2);
 });
 it('cancels during a request, saves returned usage, and resumes the checkpoint without reissuing it',async()=>{
  vi.stubEnv('AGENTDESK_RESEARCH_MAX_CALLS','1');const job=createResearchJob(actor,input);
  vi.mocked(fetch).mockImplementation(async()=>{cancelJob(actor,job.id);return reply();});await tick();
  expect(getResearchJob(actor,job.id).status).toBe('canceled');expect(getResearchJob(actor,job.id).prospects).toHaveLength(1);expect(balance('research_credits')).toMatchObject({consumed:0,reserved:0});expect(providerOperations(actor)[0].status).toBe('succeeded');
  retryJob(actor,job.id);await tick();expect(getResearchJob(actor,job.id)).toMatchObject({status:'completed',prospects:[{company:'Example Business LLC'}]});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not repeat uncertain timeouts and keeps unknown costs unknown',async()=>{
  vi.mocked(fetch).mockRejectedValue(new Error('network interrupted'));const job=createResearchJob(actor,input);await tick();expect(getResearchJob(actor,job.id).status).toBe('failed');expect(providerOperations(actor)[0]).toMatchObject({status:'unknown',actualCostCents:null});expect(balance('external_search').reserved).toBe(2);expect(()=>retryJob(actor,job.id)).toThrow('unknown outcome');await tick();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('recovers an expired worker lease without replaying a started provider request',async()=>{
  const job=createResearchJob(actor,input),operationId=`${job.id}:request:1`;
  beginProviderOperation(actor,{operationId,provider:'openai',feature:'investor-hunter',kind:'research'});reserveUsage(actor,{category:'external_search',operationId,quantity:2,source:'Bounded external web-search request'});
  getDb().prepare('INSERT INTO research_provider_calls VALUES(?,?,?,?,?,?,?,?,?,?)').run(operationId,actor.organizationId,actor.officeId,actor.id,job.id,1,'started',JSON.stringify({estimatedCostCents:50}),now(),now());
  getDb().prepare('UPDATE research_jobs SET lease_until=?,worker_token=? WHERE id=?').run('2026-10-28T14:00:00Z','dead-worker',job.id);
  await tick();expect(getResearchJob(actor,job.id).status).toBe('failed');expect(fetch).not.toHaveBeenCalled();expect(providerOperations(actor)[0].status).toBe('unknown');expect(()=>retryJob(actor,job.id)).toThrow('unknown outcome');
 });
 it('stops at cost estimate and duration budgets without additional external calls',async()=>{
  const job=createResearchJob(actor,{...input,maxCostCents:50});await tick();expect(getResearchJob(actor,job.id)).toMatchObject({status:'completed',external:{providerRequests:1,estimatedCostCents:50}});expect(fetch).toHaveBeenCalledTimes(1);
  vi.mocked(fetch).mockResolvedValue(reply(response('resp-two')));const second=createResearchJob(actor,input);await tick();vi.advanceTimersByTime(190000);await tick();expect(getResearchJob(actor,second.id).status).toBe('completed');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('enforces a provider-wide rate interval across jobs',async()=>{
  vi.stubEnv('AGENTDESK_RESEARCH_MIN_INTERVAL_MS','5000');createResearchJob(actor,{...input,limit:1});const second=createResearchJob(actor,{...input,limit:1});await tick();expect(fetch).toHaveBeenCalledTimes(1);expect(getResearchJob(actor,second.id).status).toBe('queued');vi.advanceTimersByTime(5000);await tick();expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('stops if usage is missing and preserves normalized candidates without inventing zero tokens',async()=>{
  vi.mocked(fetch).mockResolvedValue(reply(response('missing',[candidate()],{missingUsage:true})));const job=createResearchJob(actor,input);await tick();expect(getResearchJob(actor,job.id)).toMatchObject({status:'failed',external:{receiptStatus:'unknown'}});expect(getResearchJob(actor,job.id).prospects).toHaveLength(1);expect(providerOperations(actor)[0].usage).not.toHaveProperty('input_tokens');expect(()=>retryJob(actor,job.id)).toThrow('incomplete');
 });
 it('rechecks subscription restrictions before each stage and isolates historical results',async()=>{
  const job=createResearchJob(actor,input);await tick();getDb().prepare('DELETE FROM billing_trials').run();const admin=demoActor('manager'),policy=billingPolicy(admin);policy.restricted=['investor-hunter'];saveBillingPolicy(admin,policy);await tick();expect(getResearchJob(actor,job.id).status).toBe('failed');expect(fetch).toHaveBeenCalledTimes(1);expect(()=>getResearchJob(other,job.id)).toThrow('not found');expect(await processExternalResearchJobs(other)).toBe(0);expect(()=>retryJob(actor,job.id)).toThrow('Restricted');
 });
 it('records returned usage even when entitlement is removed while the request is running',async()=>{
  const job=createResearchJob(actor,input);vi.mocked(fetch).mockImplementation(async()=>{getDb().prepare('DELETE FROM billing_trials').run();const admin=demoActor('manager'),policy=billingPolicy(admin);policy.restricted=['investor-hunter'];saveBillingPolicy(admin,policy);return reply();});await tick();expect(getResearchJob(actor,job.id).status).toBe('failed');expect(providerOperations(actor)[0]).toMatchObject({status:'succeeded',usage:{input_tokens:100,output_tokens:200}});expect(getDb().prepare("SELECT state FROM research_provider_calls WHERE job_id=?").get(job.id)).toEqual({state:'completed'});
 });
 it('records every reported search above its admission estimate and stops further requests',async()=>{
  vi.mocked(fetch).mockResolvedValue(reply(response('excess',[candidate()],{searchCount:3})));const job=createResearchJob(actor,input);await tick();expect(getResearchJob(actor,job.id)).toMatchObject({status:'failed',external:{searchCalls:3}});expect(balance('external_search').consumed).toBe(3);expect(providerOperations(actor)[0].usage.web_search_calls).toBe(3);expect(()=>retryJob(actor,job.id)).toThrow('tool-call bound');await tick();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not consume target credits when the entire request budget failed',async()=>{
  vi.stubEnv('AGENTDESK_RESEARCH_MAX_CALLS','1');vi.mocked(fetch).mockResolvedValue(new Response('{}',{status:503}));const job=createResearchJob(actor,input);await tick();retryJob(actor,job.id);await tick();expect(getResearchJob(actor,job.id)).toMatchObject({status:'failed',external:{stopReason:'no_successful_response'}});expect(balance('research_credits')).toMatchObject({consumed:0,reserved:0});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('prevents two workers from dispatching the same leased job',async()=>{
  let deliver!:(response:Response)=>void;vi.mocked(fetch).mockImplementation(()=>new Promise(resolve=>{deliver=resolve;}));const job=createResearchJob(actor,{...input,limit:1});const first=tick();expect(fetch).toHaveBeenCalledTimes(1);expect(await tick()).toBe(0);deliver(reply());await first;expect(getResearchJob(actor,job.id).status).toBe('completed');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('reconciles a trusted late receipt after lease recovery without reviving the failed job',async()=>{
  let deliver!:(response:Response)=>void;vi.mocked(fetch).mockImplementation(()=>new Promise(resolve=>{deliver=resolve;}));const job=createResearchJob(actor,{...input,limit:1});const first=tick();vi.advanceTimersByTime(131000);await tick();expect(getResearchJob(actor,job.id).status).toBe('failed');expect(providerOperations(actor)[0].status).toBe('unknown');deliver(reply());await first;expect(getResearchJob(actor,job.id)).toMatchObject({status:'failed',external:{receiptStatus:'reported'}});expect(providerOperations(actor)[0].status).toBe('succeeded');expect(balance('external_search')).toMatchObject({reserved:0,consumed:1});retryJob(actor,job.id);await tick();expect(getResearchJob(actor,job.id).status).toBe('completed');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('uses the current membership for receipts after an in-flight role change',async()=>{
  const job=createResearchJob(actor,input);vi.mocked(fetch).mockImplementation(async()=>{getDb().prepare("UPDATE memberships SET role='acquisitions' WHERE user_id=? AND organization_id=? AND office_id=?").run(actor.id,actor.organizationId,actor.officeId);return reply();});await tick();const changed={...actor,role:'acquisitions' as const};expect(getResearchJob(changed,job.id).status).toBe('failed');expect(providerOperations(changed)[0].status).toBe('succeeded');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not leak protected CRM identifiers into public-source candidates or prompts',async()=>{
  const job=createResearchJob(actor,{...input,limit:1});vi.mocked(fetch).mockResolvedValue(reply(response('private',[candidate('Cedar & Stone Investments')])));await tick();expect(getResearchJob(actor,job.id).prospects[0]).toMatchObject({duplicateStatus:'possible_duplicate',matchedInvestorId:null});expect(JSON.stringify(getResearchJob(actor,job.id))).not.toContain('investor-jordan-private');
 });
});
