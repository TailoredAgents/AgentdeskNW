import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {closeActualWorkflowPreflight,prepareActualWorkflowComparison,prepareActualWorkflowCapacityConfirmation,prepareActualWorkflowCapacityFollowup,prepareActualWorkflowRepairConfirmation,runActualWorkflowComparison,inspectActualWorkflowComparison,inspectWorkflowRepairCurrentResult} from '../scripts/specialist-workflow-comparison';
import type {EvaluationTransport} from '../evaluations/specialists/runner';
import {closeDb,demoActor} from '../src/server/db';
import {getOpportunity,getOpportunityBoard} from '../src/server/opportunities';
import {getHandoff} from '../src/server/handoffs';
import {getInboxThread} from '../src/server/communications';
import {listPackages,listReleases} from '../src/server/workflows';
import {getEmployeeMemory,saveEmployeeMemory} from '../src/server/memory';

const sourceFixture=vi.hoisted(()=>({revision:null as string|null,dirty:false}));
vi.mock('node:child_process',async importOriginal=>{const original=await importOriginal<typeof import('node:child_process')>();return {...original,execFileSync:(command:string,args:string[],options:unknown)=>command==='git'&&args[0]==='status'?(sourceFixture.dirty?' M scripts/specialist-workflow-comparison.ts':''):command==='git'&&args[0]==='rev-parse'&&sourceFixture.revision?sourceFixture.revision:original.execFileSync(command,args,options as Parameters<typeof original.execFileSync>[2])};});

let root='';
beforeEach(()=>{sourceFixture.revision=null;sourceFixture.dirty=false;root=mkdtempSync(join(tmpdir(),'agentdesk-workflow-test-'));writeFileSync(join(root,'campaign.json'),JSON.stringify({version:1,id:randomUUID(),maximumCents:999,createdAt:new Date().toISOString(),runs:[]}));vi.stubEnv('OPENAI_API_KEY','mock-workflow-key-never-sent');vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();rmSync(root,{recursive:true,force:true});});

/** Scripted model responses are test-only; every returned function executes the normal application service. */
function transport(mode:'normal'|'no_artifact'|'unknown'='normal',extended=false,taskFirst=false){
 let sequence=0;const rounds=new Map<string,number>();
 const count=vi.fn(async()=>({status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:1000})}));
 const create=vi.fn(async(body:string)=>{
  if(mode==='unknown')throw new Error('Synthetic uncertain transport');
  const payload=JSON.parse(body) as {input:Record<string,unknown>[]};
  const users=payload.input.filter(item=>item.role==='user'),prompt=String(users.at(-1)?.content),index=rounds.get(prompt)??0;rounds.set(prompt,index+1);
  const contextKey=String(payload.input.find(item=>item.role==='developer')?.content);
  // Different arms repeat the same natural request. Start after the previous final response.
  void contextKey;
  const disposition=prompt.startsWith('For 123')||prompt.startsWith('Read the latest'),second=prompt.startsWith('Read the latest')||prompt.startsWith('The saved source')||prompt.startsWith('I corrected'),max=extended?(disposition&&!second?5:prompt.startsWith('I corrected')?4:disposition?4:3):disposition?4:3,round=index%max;
  let name='',args:unknown={};
  if(mode==='normal'&&round<max-1){
   if(disposition&&!second){
    if(round===0){name='match_buyers';args={propertyId:'property-maple'};}
    if(extended&&round===1){name='investor_journey';args={investorId:'investor-mike'};}
    if(round===(extended?2:1)){name='compose_deal_package';args={investorId:'investor-mike',releaseId:listReleases(demoActor()).find(r=>r.propertyId==='property-maple')!.id,channel:'email'};}
    if(round===(extended?3:2)){name='prepare_property_outreach';args={packageId:listPackages(demoActor()).at(0)!.id,accountId:null};}
   }else if(disposition){
    const threadId=prompt.match(/inbox_thread_[\w-]+/)![0];
    if(round===0){name='inbox_thread';args={threadId};}
    if(round===(taskFirst?2:1)){name='prepare_inbox_reply';args={threadId,expectedVersion:getInboxThread(demoActor(),threadId).thread.version};}
    if(round===(taskFirst?1:2)){name='create_task';args={title:'Check Mike’s buying plans next month before another property',dueAt:null,investorId:'investor-mike'};}
   }else if(prompt.startsWith('Review 456')||prompt.startsWith('The saved source')){
    const actor=demoActor('acquisitions'),id=getOpportunityBoard(actor).items.find(i=>i.address==='456 Preview Lane')!.id,current=getOpportunity(actor,id).opportunity;
    if(round===0){name='opportunity_review';args={opportunityId:id};}
    if(round===1){
     const {id:_id,version,ownerId:_ownerId,createdAt:_createdAt,updatedAt:_updatedAt,synthetic:_synthetic,...input}=current;void _id;void _ownerId;void _createdAt;void _updatedAt;void _synthetic;
     input.submission={...input.submission,askingPrice:205000,...(!second?{repairEstimate:56000,repairScope:'Cosmetic repair estimate excluding roof',repairSource:'Fictional wholesaler quote A; unverified',sourceReference:'demo:quote-A'}:{})};input.reviewNote='Repair evidence, conditional access and comparable sources remain unresolved.';
     name='prepare_opportunity_intake';args={id,expectedVersion:version,input};
    }
   }else{
    const actor=demoActor('manager'),id=getOpportunityBoard(actor).items.find(i=>i.address==='456 Preview Lane')!.id,item=getHandoff(actor,id);
    if(round===0){name='handoff_overview';args={};}
    if(extended&&second&&round===1){name='opportunity_review';args={opportunityId:id};}
    if(round===(extended&&second?2:1)){name='prepare_handoff_action';args={releaseId:id,expectedVersion:item.record?.version??0,expectedReleaseVersion:item.releaseVersion,action:'assign',assignedTo:demoActor('acquisitions').id,nextAction:second?'Obtain a replacement repair scope and confirm occupant agreement before Friday access.':'Obtain repair scope, estimate source and confirmed walkthrough arrangements.',dueAt:prompt.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/)![0],note:null,evidence:null,reportKind:null};}
   }
  }
  const output=name?[{type:'function_call',name,arguments:JSON.stringify(args),call_id:`workflow-call-${++sequence}`,status:'completed'}]:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:mode==='no_artifact'?'Here is a recommendation without saving anything.':'Saved for employee review. Source statements remain unverified; nothing was sent live or resolved automatically.'}]}];
  return {status:200,body:JSON.stringify({id:`workflow-response-${++sequence}`,model:'gpt-6.1-sol',service_tier:'default',status:'completed',output,usage:{input_tokens:1000,output_tokens:60,input_tokens_details:{cached_tokens:0}}})};
 });return {count,create} satisfies EvaluationTransport;
}
describe('actual saved-work comparison orchestration (mocked provider only)',()=>{
 it('executes both arms across three corrected workflows with exact replay and explicit employee effects',async()=>{
  const prepared=await prepareActualWorkflowComparison(root,'all-roles'),provider=transport();expect(provider.create).not.toHaveBeenCalled();
  const result=await runActualWorkflowComparison(root,'all-roles',{planHash:prepared.planHash,maximumCents:999},provider);
  expect(result.status).toBe('completed');expect(result.outcomes).toHaveLength(12);expect(result.outcomes.every(item=>item.status==='completed')).toBe(true);expect(provider.create).toHaveBeenCalledTimes(40);
  const evidence=JSON.parse(readFileSync(result.evidenceFile,'utf8'));
  expect(evidence.results.every((item:{replayVerified:boolean})=>item.replayVerified)).toBe(true);expect(JSON.stringify(evidence)).not.toContain('mock-workflow-key');
  const acquisition=evidence.results.find((item:{role:string;turn:number;arm:string})=>item.role==='acquisitions'&&item.turn===1&&item.arm==='guided');expect(acquisition.outcome.detail.opportunity.submission.repairEstimate).toBeNull();expect(acquisition.outcome.detail.opportunity.version).toBe(3);
  const manager=evidence.results.find((item:{role:string;turn:number;arm:string})=>item.role==='manager'&&item.turn===1&&item.arm==='generic');expect(manager.outcome.handoff.record).toMatchObject({state:'assigned',acknowledgedAt:null,outcome:null,resolution:null,releaseVersion:2});
  await expect(runActualWorkflowComparison(root,'all-roles',{planHash:prepared.planHash,maximumCents:999},provider)).rejects.toThrow();expect(provider.create).toHaveBeenCalledTimes(40);
 },120000);
 it('records missing artifacts as quality failures and skips dependent turns without inventing outcomes',async()=>{
  const prepared=await prepareActualWorkflowComparison(root,'no-artifacts'),provider=transport('no_artifact');
  const result=await runActualWorkflowComparison(root,'no-artifacts',{planHash:prepared.planHash,maximumCents:999},provider);
  expect(result.outcomes.filter(item=>item.status==='quality_failed')).toHaveLength(6);expect(result.outcomes.filter(item=>item.status==='prerequisite_skipped')).toHaveLength(6);expect(provider.create).toHaveBeenCalledTimes(6);
 },120000);
 it('retains unknown usage and stops instead of moving to a different role or arm',async()=>{
  const prepared=await prepareActualWorkflowComparison(root,'unknown'),provider=transport('unknown');
  await expect(runActualWorkflowComparison(root,'unknown',{planHash:prepared.planHash,maximumCents:999},provider)).rejects.toThrow('stopped');expect(provider.create).toHaveBeenCalledTimes(1);expect(inspectActualWorkflowComparison(root,'unknown').unresolved).toHaveLength(1);
 },120000);
 it('requires the existing original campaign and rejects a modified fixture before dispatch',async()=>{
  rmSync(join(root,'campaign.json'));await expect(prepareActualWorkflowComparison(root,'missing')).rejects.toThrow();
  writeFileSync(join(root,'campaign.json'),JSON.stringify({version:1,id:randomUUID(),maximumCents:999,createdAt:new Date().toISOString(),runs:[]}));
  const prepared=await prepareActualWorkflowComparison(root,'changed'),provider=transport();writeFileSync(join(prepared.directory,'fixture-material.json'),'{}');await expect(runActualWorkflowComparison(root,'changed',{planHash:prepared.planHash,maximumCents:999},provider)).rejects.toThrow();expect(provider.count).not.toHaveBeenCalled();expect(provider.create).not.toHaveBeenCalled();
 });
 it('binds operator intervention metadata to the frozen campaign plan',async()=>{
  const prepared=await prepareActualWorkflowComparison(root,'metadata'),provider=transport(),path=join(prepared.directory,'workflow-manifest.json'),manifest=JSON.parse(readFileSync(path,'utf8'));manifest.fixture.opportunityId='another-opportunity';manifest.fixture.preparedAt='2099-01-01T00:00:00.000Z';writeFileSync(path,JSON.stringify(manifest));await expect(runActualWorkflowComparison(root,'metadata',{planHash:prepared.planHash,maximumCents:999},provider)).rejects.toThrow();expect(provider.count).not.toHaveBeenCalled();expect(provider.create).not.toHaveBeenCalled();
 });
 it('reuses immutable source fixtures in a separately bounded capacity follow-up with actual extra retrieval steps',async()=>{
  const original=await prepareActualWorkflowComparison(root,'initial'),initialProvider=transport('no_artifact');
  await runActualWorkflowComparison(root,'initial',{planHash:original.planHash,maximumCents:999},initialProvider);
  const evidenceBefore=readFileSync(join(original.directory,'workflow-evidence.json'),'utf8'),fixtureBefore=readFileSync(join(original.directory,'fixture.sqlite'));
  const followup=prepareActualWorkflowCapacityFollowup(root,'capacity','initial'),provider=transport('normal',true);
  expect(followup).toMatchObject({kind:'workflow_capacity_followup',maximumCalls:40,maximumUsd:5.6384});expect(followup.slots).toHaveLength(8);expect(followup.slots.every(slot=>slot.role!=='acquisitions'&&slot.maxCalls===5)).toBe(true);
  const manifest=JSON.parse(readFileSync(join(followup.directory,'workflow-manifest.json'),'utf8'));expect(manifest.fixtureHash).toBe(original.fixtureHash);expect(readFileSync(join(followup.directory,'fixture.sqlite'))).toEqual(fixtureBefore);
  const result=await runActualWorkflowComparison(root,'capacity',{planHash:followup.planHash,maximumCents:999},provider);expect(result.status).toBe('completed');expect(result.outcomes).toHaveLength(8);expect(result.outcomes.every(outcome=>outcome.status==='completed')).toBe(true);expect(provider.create).toHaveBeenCalledTimes(32);
  const saved=JSON.parse(readFileSync(result.evidenceFile,'utf8'));expect(saved.kind).toBe('workflow_capacity_and_output_representation_followup');expect(saved.results[0].toolNames).toEqual(['match_buyers','investor_journey','compose_deal_package','prepare_property_outreach']);expect(saved.results.find((entry:{slotId:string})=>entry.slotId==='manager-guided-1').toolNames).toEqual(['handoff_overview','opportunity_review','prepare_handoff_action']);
  expect(readFileSync(join(original.directory,'workflow-evidence.json'),'utf8')).toBe(evidenceBefore);expect(readFileSync(join(original.directory,'fixture.sqlite'))).toEqual(fixtureBefore);
 },120000);
 it('closes a proven preflight stop without changing evidence and runs the final confirmation with per-turn caps',async()=>{
  const original=await prepareActualWorkflowComparison(root,'initial');await runActualWorkflowComparison(root,'initial',{planHash:original.planHash,maximumCents:999},transport('no_artifact'));
  const followup=prepareActualWorkflowCapacityFollowup(root,'input-stop','initial'),stoppedProvider=transport('normal',true);let countCalls=0;
  stoppedProvider.count.mockImplementation(async()=>({status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:++countCalls===4?20263:1000})}));
  await expect(runActualWorkflowComparison(root,'input-stop',{planHash:followup.planHash,maximumCents:999},stoppedProvider)).rejects.toThrow('stopped');expect(stoppedProvider.create).toHaveBeenCalledTimes(3);
  const previousEvidence=readFileSync(join(followup.directory,'workflow-evidence.json'),'utf8'),previousExecution=readFileSync(join(followup.directory,'execution.json'),'utf8');
  const closed=closeActualWorkflowPreflight(root,'input-stop',followup.planHash);expect(closed.status).toBe('closed_preflight');expect(readFileSync(join(followup.directory,'workflow-evidence.json'),'utf8')).toBe(previousEvidence);expect(readFileSync(join(followup.directory,'execution.json'),'utf8')).toBe(previousExecution);
  const final=prepareActualWorkflowCapacityConfirmation(root,'final','initial','input-stop');expect(final.maximumCalls).toBe(36);expect(final.maximumUsd).toBe(5.97456);expect(final.slots.filter(slot=>slot.role==='manager'&&slot.turn===0).every(slot=>slot.maxCalls===3)).toBe(true);expect(final.slots.filter(slot=>!(slot.role==='manager'&&slot.turn===0)).every(slot=>slot.maxCalls===5)).toBe(true);
  const provider=transport('normal',true),sizes:{case:string;bytes:number;roundCap:number}[]=[];
  const measured:EvaluationTransport={count:async body=>{const payload=JSON.parse(body),prompt=String(payload.input.filter((item:{role?:string})=>item.role==='user').at(-1).content),label=prompt.startsWith('For 123')?'dispositions-first':prompt.startsWith('Read the latest')?'dispositions-second':prompt.startsWith('I corrected')?'manager-second':'manager-first';sizes.push({case:label,bytes:Buffer.byteLength(body),roundCap:Number(process.env.AGENTDESK_TEXT_MAX_ROUNDS)});expect(process.env.AGENTDESK_TEXT_MAX_INPUT_TOKENS).toBe('25000');expect(process.env.AGENTDESK_TEXT_MAX_TOOL_CALLS).toBe('8');return provider.count();},create:provider.create};
  const result=await runActualWorkflowComparison(root,'final',{planHash:final.planHash,maximumCents:999},measured);expect(result.outcomes.every(outcome=>outcome.status==='completed')).toBe(true);expect(provider.create).toHaveBeenCalledTimes(32);expect(sizes.filter(size=>size.case==='manager-first').every(size=>size.roundCap===3)).toBe(true);expect(sizes.filter(size=>size.case!=='manager-first').every(size=>size.roundCap===5)).toBe(true);
  expect(readFileSync(join(followup.directory,'workflow-evidence.json'),'utf8')).toBe(previousEvidence);expect(readFileSync(join(followup.directory,'execution.json'),'utf8')).toBe(previousExecution);expect(inspectActualWorkflowComparison(root,'input-stop').status).toBe('closed_preflight');
 },120000);
 it('runs one guided repair on the original fixture and separately validates the current saved package reply',async()=>{
  // Historical plans and their settled provider receipts are synthetic test-only
  // preparations; the repair still executes actual application services below.
  const original=await prepareActualWorkflowComparison(root,'repair-original');await runActualWorkflowComparison(root,'repair-original',{planHash:original.planHash,maximumCents:999},transport('no_artifact'));
  const followup=prepareActualWorkflowCapacityFollowup(root,'repair-input-stop','repair-original'),stopped=transport('normal',true);let count=0;
  stopped.count.mockImplementation(async()=>({status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:++count===4?20263:1000})}));
  await expect(runActualWorkflowComparison(root,'repair-input-stop',{planHash:followup.planHash,maximumCents:999},stopped)).rejects.toThrow('stopped');closeActualWorkflowPreflight(root,'repair-input-stop',followup.planHash);
  const previous=prepareActualWorkflowCapacityConfirmation(root,'repair-predecessor','repair-original','repair-input-stop');
  expect(()=>prepareActualWorkflowRepairConfirmation(root,'not-completed','repair-original','repair-predecessor')).toThrow();expect(existsSync(join(root,'not-completed'))).toBe(false);
  await runActualWorkflowComparison(root,'repair-predecessor',{planHash:previous.planHash,maximumCents:999},transport('no_artifact'));
  const paths=[original.directory,followup.directory,previous.directory].flatMap(directory=>['plan.json','ledger.json','workflow-evidence.json','execution.json','workflow-manifest.json','fixture-material.json','fixture.sqlite'].map(file=>join(directory,file))),history=paths.map(path=>readFileSync(path));
  const campaignBefore=readFileSync(join(root,'campaign.json'),'utf8');
  expect(()=>prepareActualWorkflowRepairConfirmation(root,'same-revision','repair-original','repair-predecessor')).toThrow(/different committed/);expect(existsSync(join(root,'same-revision'))).toBe(false);
  sourceFixture.revision='d'.repeat(40);sourceFixture.dirty=true;expect(()=>prepareActualWorkflowRepairConfirmation(root,'dirty-revision','repair-original','repair-predecessor')).toThrow(/Commit/);sourceFixture.dirty=false;
  expect(()=>prepareActualWorkflowRepairConfirmation(root,'wrong-predecessor','repair-original','repair-input-stop')).toThrow();
  const fixture=JSON.parse(readFileSync(join(original.directory,'workflow-manifest.json'),'utf8')).fixture;
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(fixture.preparedAt)+86400001);expect(()=>prepareActualWorkflowRepairConfirmation(root,'expired-fixture','repair-original','repair-predecessor')).toThrow(/one-day/);clock.mockReturnValue(Date.parse(fixture.preparedAt)-1);expect(()=>prepareActualWorkflowRepairConfirmation(root,'future-fixture','repair-original','repair-predecessor')).toThrow(/one-day/);clock.mockRestore();
  expect(readFileSync(join(root,'campaign.json'),'utf8')).toBe(campaignBefore);
  const prepared=prepareActualWorkflowRepairConfirmation(root,'repair','repair-original','repair-predecessor');expect(prepared).toMatchObject({kind:'workflow_repair_confirmation',maximumCalls:10,maximumUsd:1.6596,repairAfter:{name:'repair-predecessor',planHash:previous.planHash}});expect(prepared.slots).toHaveLength(2);expect(prepared.slots.every(slot=>slot.role==='dispositions'&&slot.arm==='guided'&&slot.maxCalls===5)).toBe(true);
  const originalManifest=JSON.parse(readFileSync(join(original.directory,'workflow-manifest.json'),'utf8')),manifestPath=join(prepared.directory,'workflow-manifest.json'),manifestText=readFileSync(manifestPath,'utf8'),manifest=JSON.parse(manifestText);
  expect(manifest.fixtureHash).toBe(original.fixtureHash);expect(manifest.fixture).toEqual(originalManifest.fixture);expect(manifest.rubric).toEqual(originalManifest.rubric);expect(manifest.after).toBeUndefined();expect(readFileSync(join(prepared.directory,'fixture.sqlite'))).toEqual(readFileSync(join(original.directory,'fixture.sqlite')));
  for(const slot of prepared.slots){const initial=original.slots.find(item=>item.id===slot.id)!;expect(slot.request).toBe(initial.request);expect(slot.conversationId).toBe(initial.conversationId);expect(slot.employeeRequestId).not.toBe(initial.employeeRequestId);expect(previous.slots.some(item=>item.employeeRequestId===slot.employeeRequestId)).toBe(false);}
  const provider=transport('normal',true,true),measured:EvaluationTransport={count:async body=>{expect(process.env.AGENTDESK_TEXT_MAX_ROUNDS).toBe('5');expect(process.env.AGENTDESK_TEXT_MAX_TOOL_CALLS).toBe('8');expect(process.env.AGENTDESK_TEXT_MAX_INPUT_TOKENS).toBe('25000');expect(process.env.AGENTDESK_TEXT_MAX_OUTPUT_TOKENS).toBe('4096');expect(process.env.AGENTDESK_TEXT_MAX_CONTEXT_BYTES).toBe('180000');expect(JSON.parse(body).model).toBe('gpt-6.1-sol');return provider.count();},create:provider.create};
  manifest.repairAfter.planHash='0'.repeat(64);writeFileSync(manifestPath,JSON.stringify(manifest));await expect(runActualWorkflowComparison(root,'repair',{planHash:prepared.planHash,maximumCents:999},measured)).rejects.toThrow();expect(provider.count).not.toHaveBeenCalled();writeFileSync(manifestPath,manifestText);
  const result=await runActualWorkflowComparison(root,'repair',{planHash:prepared.planHash,maximumCents:999},measured);expect(result.status).toBe('completed');expect(result.outcomes).toHaveLength(2);expect(result.outcomes.every(item=>item.status==='completed')).toBe(true);expect(provider.create).toHaveBeenCalledTimes(9);expect(existsSync(join(prepared.directory,'dispositions-generic.sqlite'))).toBe(false);
  const evidence=JSON.parse(readFileSync(result.evidenceFile,'utf8')),second=evidence.results[1];expect(evidence.kind).toBe('single_guided_disposition_repair_observation');expect(evidence.repairAfter).toEqual(prepared.repairAfter);expect(evidence.results.every((item:{replayVerified:boolean})=>item.replayVerified)).toBe(true);expect(second.toolNames).toEqual(['inbox_thread','create_task','prepare_inbox_reply']);expect(second.repairCurrentResult).toMatchObject({kind:'repair_only_current_saved_result',passed:true,ordinaryDraftReference:null,checks:{exactSavedPreparation:true,currentAccess:true,currentGeneratedReply:true}});
  expect(second.outcome.detail.draft.body).toContain('you’re pausing purchases');expect(second.outcome.detail.draft.body).toContain('next month');expect(second.outcome.detail.draft.body).not.toContain('What purchase timing');expect(second.outcome.detail.draft).toMatchObject({authorship:'copilot',deliveryStatus:'not_sent'});expect(second.outcome.newTasks).toHaveLength(1);expect(second.outcome.newTasks[0]).toMatchObject({investorId:'investor-mike',dueAt:null});expect(second.operatorEvents.map((event:{kind:string})=>event.kind)).toEqual(['employee_reviewed_simulated_send','employee_selected_fictional_reply']);
  await expect(runActualWorkflowComparison(root,'repair',{planHash:prepared.planHash,maximumCents:999},measured)).rejects.toThrow();expect(provider.create).toHaveBeenCalledTimes(9);expect(()=>prepareActualWorkflowRepairConfirmation(root,'second-repair','repair-original','repair-predecessor')).toThrow(/already registered/);expect(()=>prepareActualWorkflowCapacityConfirmation(root,'second-capacity','repair-original','repair-input-stop')).toThrow(/already registered/);
  for(const [index,path] of paths.entries())expect(readFileSync(path)).toEqual(history[index]);
  // Free fault injection only, after the recorded run: a changed employee style
  // leaves the exact saved receipt intact but makes its generated wording stale.
  vi.stubEnv('AGENTDESK_DB_PATH',join(prepared.directory,'dispositions-guided.sqlite'));vi.stubEnv('DATABASE_PATH',join(prepared.directory,'dispositions-guided.sqlite'));vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
  const actor=demoActor(),receipt=second.receipts.find((item:{callId:string})=>item.callId===second.toolCalls.find((call:{name:string})=>call.name==='prepare_inbox_reply').callId).result,threadId=second.outcome.detail.thread.id,memory=getEmployeeMemory(actor);
  saveEmployeeMemory(actor,{tone:memory.tone==='direct'?'warm':'direct',expectedVersion:memory.version,sourceText:'Fictional test-only employee preference correction'});
  const changed=inspectWorkflowRepairCurrentResult(actor,threadId,receipt);expect(changed).toMatchObject({passed:false,ordinaryDraftReference:null,checks:{exactSavedPreparation:true,currentAccess:true,currentGeneratedReply:false}});expect(getInboxThread(actor,threadId).draft).toEqual(second.outcome.detail.draft);
 },120000);
});
