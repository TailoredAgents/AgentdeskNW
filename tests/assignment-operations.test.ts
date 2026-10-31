import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {createWorkRun} from '../src/server/work-runs';
import {createResearchJob} from '../src/server/services';
import {withAssignment,currentAssignment,getAssignmentBinding} from '../src/server/assignment-roots';
import {quoteCurrentAssignment,currentMeteredAssignment} from '../src/server/assignment-metering';
import {finishMeteredAssignment} from '../src/server/metered-work';
import {presentCurrentAssignmentQuote,decideAssignmentReview,getAssignmentReview,cancelAssignmentReview} from '../src/server/assignment-reviews';
import {runSimulatedAssignmentOperation,readSimulatedAssignmentOperation,reconcileSimulatedAssignmentOperation,type SimulatedAssignmentAdapter,type SimulatedOperationReceipt} from '../src/server/assignment-operations';
import {getWalletState,topUpWallet} from '../src/server/wallet';
import {fingerprint} from '../src/server/provider-runtime';
import type {MeteredPart} from '../src/lib/metered-work-contracts';

let sequence=0,directory='';const key=()=>`operation-test-${++sequence}`,actor=()=>demoActor();
const scope=fingerprint('fictional current scope'),host=(id:string)=>({kind:'work' as const,id});
const job=()=>createWorkRun(actor(),{requestId:key(),title:'Fictional saved source review',instructions:'Read the fictional property',steps:[{key:'facts',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]}]});
const text=(key:string,cents=20,parentKey?:string):MeteredPart=>({key,parentKey,feature:'core',rateId:'test-text-v1',maximumCalls:4,maximumUnits:{output_tokens:cents*200},estimatedUnits:{output_tokens:cents*100}});
function setup(parts=[text('reasoning')]){
 const root=host(job().id);
 return withAssignment(actor(),root,()=>{
  const assignment=quoteCurrentAssignment(actor(),{title:'Fictional mixed assignment',scopeHash:scope,revision:1,parts});
  const review=presentCurrentAssignmentQuote(actor(),{summary:'Simulate the listed bounded work. No network, customer contact or verified business outcome.',parts:parts.map(p=>({key:p.key,label:`Fictional ${p.key}`}))});
  return {root,assignment,review};
 });
}
const input=(partKey='reasoning',bounds={output_tokens:100},operationKey=key())=>({key:operationKey,partKey,revision:1,scopeHash:scope,bounds,request:{prompt:'Fictional test only'}});
const receipt=(usage={output_tokens:100}):SimulatedOperationReceipt=>({status:'succeeded',responseId:key(),usage,result:{summary:'Fictional saved result'}});
const adapter=(result:SimulatedOperationReceipt=receipt(),rateId='test-text-v1'):SimulatedAssignmentAdapter=>({id:`fixture-${rateId}`,rateId,execute:vi.fn(async()=>result)});
function approve(value:ReturnType<typeof setup>){return decideAssignmentReview(actor(),value.review.id,{quoteId:value.review.quoteId,revision:1,eventKey:key(),decision:'approve'});}
beforeEach(()=>{closeDb();sequence=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Network forbidden in simulation');}));});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});

describe('durable simulated mixed-host assignment execution',()=>{
 it('requires one decision for reasoning, search, delegated analysis and audio, then settles one aggregate charge',async()=>{
  const parts=[text('reasoning',20),{key:'research',parentKey:'reasoning',feature:'investor-hunter',rateId:'test-search-v1',maximumCalls:1,maximumUnits:{search_calls:1},estimatedUnits:{search_calls:1}},text('analysis',20,'research'),{key:'voice',parentKey:'reasoning',feature:'core',rateId:'test-voice-v1',maximumCalls:1,maximumUnits:{audio_input_units:400,audio_output_units:400},estimatedUnits:{audio_input_units:200,audio_output_units:200}}];
  const value=setup(parts);expect(value.review.maximumCents).toBe(102);const first=input(),transport=adapter();
  await expect(withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),first,transport,()=>scope))).rejects.toThrow('approve');expect(transport.execute).not.toHaveBeenCalled();
  approve(value);
  const children=withAssignment(actor(),value.root,()=>({analysis:host(job().id),research:{kind:'research' as const,id:createResearchJob(actor(),{address:'123 Example Street',county:'Orange',price:150000,strategy:'flip',limit:1}).id}}));
  for(const child of Object.values(children))expect(getAssignmentBinding(actor(),child)?.rootId).toBe(getAssignmentBinding(actor(),value.root)?.rootId);
  await withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),first,transport,()=>scope));
  await withAssignment(actor(),children.research,()=>runSimulatedAssignmentOperation(actor(),{...input('research'),bounds:{search_calls:1}},adapter({...receipt(),usage:{search_calls:1}},'test-search-v1'),()=>scope));
  await withAssignment(actor(),children.analysis,()=>runSimulatedAssignmentOperation(actor(),input('analysis'),adapter(),()=>scope));
  await withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),{...input('voice'),bounds:{audio_input_units:100,audio_output_units:100}},adapter({...receipt(),usage:{audio_input_units:100,audio_output_units:100}},'test-voice-v1'),()=>scope));
  const done=finishMeteredAssignment(actor(),value.assignment.id,'completed');expect(done.budget.spentCents).toBe(54);expect(done.attempts).toHaveLength(4);expect(done.providerCostMicros).toBeNull();expect(getWalletState(actor()).reservedCents).toBe(0);
  const activity=getAssignmentReview(actor(),value.review.id).activity!;expect(activity.pending).toBe(0);expect(activity.parts.map(p=>p.confirmed)).toEqual([1,1,1,1]);expect(fetch).not.toHaveBeenCalled();
 });
 it.each([99,100,101])('enforces the %i cent boundary before invoking any adapter',async cents=>{
  const value=setup([text('reasoning',cents)]),request=input(),transport=adapter();
  if(cents>100){await expect(withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),request,transport,()=>scope))).rejects.toThrow('approve');approve(value);}
  await withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),request,transport,()=>scope));expect(transport.execute).toHaveBeenCalledTimes(1);
 });
 it('commits admission before awaiting and returns the saved result without dispatching twice',async()=>{
  const value=setup(),request=input(),final=receipt();let resolve!:(value:SimulatedOperationReceipt)=>void;
  const transport={id:'held-fixture',rateId:'test-text-v1',execute:vi.fn(()=>new Promise<SimulatedOperationReceipt>(r=>{resolve=r;}))};
  await withAssignment(actor(),value.root,async()=>{
   const pending=runSimulatedAssignmentOperation(actor(),request,transport,()=>scope);
   expect((await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope))).toMatchObject({dispatched:false,state:'dispatched',result:null});
   resolve(final);expect((await pending).result).toEqual(final.result);
   expect((await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope))).toMatchObject({dispatched:false,state:'received',result:final.result});
   expect(transport.execute).toHaveBeenCalledTimes(1);expect(currentMeteredAssignment(actor()).attempts).toHaveLength(1);
  });
 });
 it('persists uncertain dispatch across database reopen, reconciles once and never runs the fake again',async()=>{
  directory=mkdtempSync(join(tmpdir(),'agentdesk-mixed-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.db'));
  const value=setup(),request=input(),transport={...adapter(),execute:vi.fn(async()=>{throw new Error('timeout');})};
  await expect(withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),request,transport,()=>scope))).rejects.toThrow('timeout');
  closeDb();await withAssignment(actor(),value.root,async()=>{
   expect((await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope))).toMatchObject({state:'unknown',dispatched:false,result:null});
   const final=receipt();reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,final);reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,final);
   expect(readSimulatedAssignmentOperation(actor(),request.key,()=>scope).result).toEqual(final.result);expect(currentMeteredAssignment(actor()).budget.spentCents).toBe(1);
   expect(transport.execute).toHaveBeenCalledTimes(1);
  });
 });
 it('keeps unknown credit held after cancellation until the exact late receipt, without reviving output',async()=>{
  const value=setup(),request=input(),transport=adapter({status:'unknown',responseId:'late-response',usage:null});
  await withAssignment(actor(),value.root,async()=>{
   await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope);
   cancelAssignmentReview(actor(),value.review.id,{quoteId:value.review.quoteId,revision:1,eventKey:key()});
   expect(getWalletState(actor()).reservedCents).toBe(20);
   const final={...receipt(),responseId:'late-response'};const reconciled=reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,final);
   expect(reconciled.status).toBe('canceled');expect(getWalletState(actor()).reservedCents).toBe(0);expect(reconciled.budget.spentCents).toBe(1);
   expect(readSimulatedAssignmentOperation(actor(),request.key,()=>scope)).toMatchObject({withheld:true,result:null});
  });
 });
 it('records incurred usage after a source change but withholds the old result',async()=>{
  const value=setup(),request=input();let current=scope;
  const transport={...adapter(),execute:async()=>{current=fingerprint('revoked');return receipt();}};
  const outcome=await withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),request,transport,()=>current));
  expect(outcome).toMatchObject({withheld:true,result:null,state:'received',assignment:{budget:{spentCents:1}}});
 });
 it('rejects changed preflight context without a claim or hold',async()=>{
  const value=setup(),transport=adapter();await expect(withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),input(),transport,()=>fingerprint('changed')))).rejects.toThrow('sources changed');
  expect(transport.execute).not.toHaveBeenCalled();expect(getWalletState(actor()).reservedCents).toBe(0);
 });
 it('does not let a sibling host retrieve, reuse or reconcile another child operation',async()=>{
  const value=setup(),child=withAssignment(actor(),value.root,()=>host(job().id)),request=input(),transport=adapter();
  await withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),request,transport,()=>scope));
  await withAssignment(actor(),child,async()=>{
   expect(()=>readSimulatedAssignmentOperation(actor(),request.key,()=>scope)).toThrow('original operation host');
   expect(()=>reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,receipt())).toThrow('original operation host');
   await expect(runSimulatedAssignmentOperation(actor(),request,transport,()=>scope)).rejects.toThrow('original operation host');
  });
 });
 it('rejects owner/office/root forgery and caller prices',async()=>{
  const value=setup();expect(()=>withAssignment(demoActor('manager'),value.root,()=>readSimulatedAssignmentOperation(demoActor('manager'),'x',()=>scope))).toThrow();
  await withAssignment(actor(),value.root,async()=>{for(const extra of [{assignmentId:value.assignment.id},{price:0},{rootId:currentAssignment(actor()).rootId}])await expect(runSimulatedAssignmentOperation(actor(),{...input(),...extra} as never,adapter(),()=>scope)).rejects.toThrow();});
 });
 it('rejects altered request identity and a different receipt adapter',async()=>{
  const value=setup(),request=input(),transport=adapter();await withAssignment(actor(),value.root,async()=>{
   await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope);
   await expect(runSimulatedAssignmentOperation(actor(),{...request,request:{prompt:'changed'}},transport,()=>scope)).rejects.toThrow('different work');
   expect(()=>reconcileSimulatedAssignmentOperation(actor(),request.key,'wrong',receipt())).toThrow('adapter');
   expect(()=>reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,receipt())).toThrow('conflicts');
  });
 });
 it.each(['missing','negative','unknown_result','oversized'])('keeps malformed %s usage/output unresolved rather than charging zero or publishing it',async mode=>{
  const value=setup(),request=input(),raw=mode==='missing'?{...receipt(),usage:null}:mode==='negative'?{...receipt(),usage:{output_tokens:-1}}:mode==='unknown_result'?{...receipt(),status:'unknown',usage:null}:{...receipt(),result:'x'.repeat(250001)};
  await withAssignment(actor(),value.root,async()=>{
   await expect(runSimulatedAssignmentOperation(actor(),request,adapter(raw as SimulatedOperationReceipt),()=>scope)).rejects.toThrow();
   expect(readSimulatedAssignmentOperation(actor(),request.key,()=>scope)).toMatchObject({state:'unknown',result:null,assignment:{budget:{spentCents:0,reservedCents:20}}});
  });
 });
 it('retains failed incurred usage and admits a distinct bounded retry under the same assignment',async()=>{
  const value=setup();await withAssignment(actor(),value.root,async()=>{
   await runSimulatedAssignmentOperation(actor(),input(),adapter({status:'failed',responseId:key(),usage:{output_tokens:100}}),()=>scope);
   await runSimulatedAssignmentOperation(actor(),input(),adapter(),()=>scope);
   const current=currentMeteredAssignment(actor());expect(current.attempts).toHaveLength(2);expect(current.budget.spentCents).toBe(1);
   expect(getAssignmentReview(actor(),value.review.id).activity?.parts[0]).toMatchObject({started:2,confirmed:2,failed:1,pending:0,recordedMicros:10000});
  });
 });
 it('caps overruns and suppresses successful output until reconciliation',async()=>{
  const value=setup([text('reasoning',1)]),request=input();await withAssignment(actor(),value.root,async()=>{
   const outcome=await runSimulatedAssignmentOperation(actor(),request,adapter(receipt({output_tokens:1000})),()=>scope);
   expect(outcome).toMatchObject({withheld:true,result:null,assignment:{status:'paused',budget:{spentCents:1}}});
   expect(getAssignmentReview(actor(),value.review.id).activity?.overrun).toBe(true);
   await expect(runSimulatedAssignmentOperation(actor(),input(),adapter(),()=>scope)).rejects.toThrow('cannot dispatch');
  });
 });
 it('does not let funding approve denied work or expired quotes',async()=>{
  const value=setup([text('reasoning',101)]);decideAssignmentReview(actor(),value.review.id,{quoteId:value.review.quoteId,revision:1,eventKey:key(),decision:'deny'});
  topUpWallet(actor(),{amountCents:1000,eventKey:key(),expectedVersion:getWalletState(actor()).version});const transport=adapter();
  await expect(withAssignment(actor(),value.root,()=>runSimulatedAssignmentOperation(actor(),input(),transport,()=>scope))).rejects.toThrow('approve');
  const expired=setup([text('reasoning',101)]);approve(expired);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+16*60_000);
  await expect(withAssignment(actor(),expired.root,()=>runSimulatedAssignmentOperation(actor(),input(),transport,()=>scope))).rejects.toThrow('expired');expect(transport.execute).not.toHaveBeenCalled();
 });
 it('rejects mismatched adapters before holding credit and protects immutable saved outcomes',async()=>{
  const value=setup();await withAssignment(actor(),value.root,async()=>{
   await expect(runSimulatedAssignmentOperation(actor(),input(),adapter(receipt(),'test-search-v1'),()=>scope)).rejects.toThrow('does not match');expect(getWalletState(actor()).reservedCents).toBe(0);
   await runSimulatedAssignmentOperation(actor(),input(),adapter(),()=>scope);
  });
  expect(()=>getDb().prepare("UPDATE assignment_operations SET result='{}'").run()).toThrow('immutable');
  expect(()=>getDb().prepare('DELETE FROM assignment_operations').run()).toThrow('cannot be deleted');
 });
 it('retains a valid response identity when receipt validation fails and rejects its replacement',async()=>{
  const value=setup(),request=input(),transport=adapter({...receipt(),responseId:'original-response',usage:null});
  await withAssignment(actor(),value.root,async()=>{
   await expect(runSimulatedAssignmentOperation(actor(),request,transport,()=>scope)).rejects.toThrow('authoritative');
   expect(currentMeteredAssignment(actor()).attempts[0].responseId).toBe('original-response');
   expect(()=>reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,receipt())).toThrow('original provider response');
   reconcileSimulatedAssignmentOperation(actor(),request.key,transport.id,{...receipt(),responseId:'original-response'});
  });
 });
 it('keeps completed output readable after finishing without sending or settling it again',async()=>{
  const value=setup(),request=input(),transport=adapter();await withAssignment(actor(),value.root,async()=>{
   const first=await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope);
   finishMeteredAssignment(actor(),value.assignment.id,'completed');
   const again=await runSimulatedAssignmentOperation(actor(),request,transport,()=>scope);
   expect(again.result).toEqual(first.result);expect(again.withheld).toBe(false);expect(again.dispatched).toBe(false);expect(transport.execute).toHaveBeenCalledTimes(1);
  });
 });
 it('withholds accounting detail on an obsolete review rather than mixing old scope and new usage',()=>{
  const value=setup();withAssignment(actor(),value.root,()=>quoteCurrentAssignment(actor(),{title:'Changed fictional scope',revision:2,scopeHash:scope,parts:[text('reasoning',101)]}));
  expect(getAssignmentReview(actor(),value.review.id)).toMatchObject({state:'obsolete'});expect(getAssignmentReview(actor(),value.review.id).activity).toBeUndefined();
 });
});
