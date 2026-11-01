import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareActualWorkflowComparison,runActualWorkflowComparison,inspectActualWorkflowComparison} from '../scripts/specialist-workflow-comparison';
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
function transport(mode:'normal'|'no_artifact'|'unknown'='normal'){
 let sequence=0;const rounds=new Map<string,number>();
 const count=vi.fn(async()=>({status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:1000})}));
 const create=vi.fn(async(body:string)=>{
  if(mode==='unknown')throw new Error('Synthetic uncertain transport');
  const payload=JSON.parse(body) as {input:Record<string,unknown>[]};
  const users=payload.input.filter(item=>item.role==='user'),prompt=String(users.at(-1)?.content),index=rounds.get(prompt)??0;rounds.set(prompt,index+1);
  const contextKey=String(payload.input.find(item=>item.role==='developer')?.content);
  // Different arms repeat the same natural request. Start after the previous final response.
  void contextKey;
  const disposition=prompt.startsWith('For 123')||prompt.startsWith('Read the latest'),second=prompt.startsWith('Read the latest')||prompt.startsWith('The saved source')||prompt.startsWith('I corrected'),max=disposition?4:3,round=index%max;
  let name='',args:unknown={};
  if(mode==='normal'&&round<max-1){
   if(disposition&&!second){
    if(round===0){name='match_buyers';args={propertyId:'property-maple'};}
    if(round===1){name='compose_deal_package';args={investorId:'investor-mike',releaseId:listReleases(demoActor()).find(r=>r.propertyId==='property-maple')!.id,channel:'email'};}
    if(round===2){name='prepare_property_outreach';args={packageId:listPackages(demoActor()).at(0)!.id,accountId:null};}
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
    if(round===1){name='prepare_handoff_action';args={releaseId:id,expectedVersion:item.record?.version??0,expectedReleaseVersion:item.releaseVersion,action:'assign',assignedTo:demoActor('acquisitions').id,nextAction:second?'Obtain a replacement repair scope and confirm occupant agreement before Friday access.':'Obtain repair scope, estimate source and confirmed walkthrough arrangements.',dueAt:prompt.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/)![0],note:null,evidence:null,reportKind:null};}
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
});
