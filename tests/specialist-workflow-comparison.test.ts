import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {closeActualWorkflowPreflight,prepareActualWorkflowComparison,prepareActualWorkflowCapacityConfirmation,prepareActualWorkflowCapacityFollowup,runActualWorkflowComparison,inspectActualWorkflowComparison} from '../scripts/specialist-workflow-comparison';
import type {EvaluationTransport} from '../evaluations/specialists/runner';
import {closeDb,demoActor} from '../src/server/db';
import {getOpportunity,getOpportunityBoard} from '../src/server/opportunities';
import {getHandoff} from '../src/server/handoffs';
import {getInboxThread} from '../src/server/communications';
import {listPackages,listReleases} from '../src/server/workflows';

vi.mock('node:child_process',async importOriginal=>{const original=await importOriginal<typeof import('node:child_process')>();return {...original,execFileSync:(command:string,args:string[],options:unknown)=>command==='git'&&args[0]==='status'?'':original.execFileSync(command,args,options as Parameters<typeof original.execFileSync>[2])};});

let root='';
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'agentdesk-workflow-test-'));writeFileSync(join(root,'campaign.json'),JSON.stringify({version:1,id:randomUUID(),maximumCents:999,createdAt:new Date().toISOString(),runs:[]}));vi.stubEnv('OPENAI_API_KEY','mock-workflow-key-never-sent');vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();rmSync(root,{recursive:true,force:true});});

/** Scripted model responses are test-only; every returned function executes the normal application service. */
function transport(mode:'normal'|'no_artifact'|'unknown'='normal',extended=false){
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
    if(round===1){name='prepare_inbox_reply';args={threadId,expectedVersion:getInboxThread(demoActor(),threadId).thread.version};}
    if(round===2){name='create_task';args={title:'Check Mike’s buying plans next month before another property',dueAt:null,investorId:'investor-mike'};}
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
});
