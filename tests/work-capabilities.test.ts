import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import type {Actor,Property} from '../src/lib/contracts';
import type {WorkRun,WorkStepInput} from '../src/lib/work-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {createConversation,getConversation,addMessage,listTasks} from '../src/server/services';
import {chat,dispatchTool,toolDefinitions} from '../src/server/orchestrator';
import {buildWorkPreset} from '../src/server/work-presets';
import {listWorkCapabilities,validateWorkSteps} from '../src/server/work-capabilities';
import {workRoute} from '../src/server/work-api';
import {createWorkRun,getWorkRun,listWorkRuns,processWorkRuns,decideWorkCost,reviseWorkRun} from '../src/server/work-runs';
import {workContextSnapshot,workRunVisible} from '../src/server/work-context';
import {executeRecordedTool} from '../src/server/text-runtime';

let actor:Actor,sequence=0;
const next=()=>`work-capability-${++sequence}`;
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected external provider call');}));vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));actor=demoActor();sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
function toolPlan(steps:WorkStepInput[]){return {title:'Inspect and prepare my next work',steps:steps.map(({input,...step})=>({...step,inputJson:JSON.stringify(input)}))};}
function command(message='Inspect this property and create a follow-up task.'){return {conversationId:createConversation(actor).id,requestId:next(),message};}

describe('registered durable-work capabilities and typed Copilot integration',()=>{
 it('exposes strict model schemas without granting approval, purchases, sends or arbitrary execution',async()=>{
  const tools=toolDefinitions(),names=tools.map(tool=>tool.name);
  expect(names).toEqual(expect.arrayContaining(['work_capabilities','start_work','work_status']));
  for(const name of ['approve_work','decide_work_cost','topup_work','send_work','execute_code'])expect(names).not.toContain(name);
  for(const name of ['work_capabilities','start_work','work_status']){const tool=tools.find(item=>item.name===name)!;expect(tool.strict).toBe(true);expect(tool.parameters.additionalProperties).toBe(false);}
  const start=tools.find(item=>item.name==='start_work')!;expect(start.parameters.required).toEqual(expect.arrayContaining(['title','steps']));
  const listing=await dispatchTool(actor,'work_capabilities',{});expect((listing.data as {capabilities:unknown[]}).capabilities).toHaveLength(9);expect(fetch).not.toHaveBeenCalled();
  await expect(dispatchTool(actor,'work_capabilities',{ownerId:'user-other'})).rejects.toThrow();
 });
 it('keeps availability tied to role and implemented capability instead of catalog labels',()=>{
  expect(listWorkCapabilities(actor).find(item=>item.capabilityId==='office_priorities')?.available).toBe(false);
  expect(listWorkCapabilities(demoActor('acquisitions')).find(item=>item.capabilityId==='review_handoff')?.available).toBe(true);
  expect(()=>validateWorkSteps(actor,[{key:'manage',capabilityId:'office_priorities',input:{},dependsOn:[]}])).toThrow();
  expect(()=>buildWorkPreset(actor,{presetId:'management'})).toThrow('current role');
  expect(()=>buildWorkPreset(demoActor('acquisitions'),{presetId:'acquisitions',propertyId:'property-maple',includeResearch:true})).toThrow('does not include');
 });
 it('binds one composed plan to the authenticated parent turn and rejects splitting that assignment',async()=>{
  const ctx=command(),steps=buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',investorId:'investor-mike'}).steps;
  const first=await dispatchTool(actor,'start_work',toolPlan(steps),ctx),run=first.data as WorkRun;
  expect(run.budget.maximumCents).toBe(100);expect(run.status).toBe('queued');expect((await dispatchTool(actor,'start_work',toolPlan(steps),ctx)).artifacts[0].id).toBe(run.id);
  await expect(dispatchTool(actor,'start_work',{...toolPlan(steps),title:'A second inexpensive piece'},ctx)).rejects.toThrow('different work');
  expect(listWorkRuns(actor)).toHaveLength(1);expect(run.conversationId).toBe(ctx.conversationId);expect(run.instructions).toBe(ctx.message);
  expect(first.artifacts).toMatchObject([{type:'work_run',id:run.id}]);
 });
 it('requires explicit follow-up/research intent and rejects forged cost/provider fields',async()=>{
  const preset=buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',includeResearch:true});
  await expect(dispatchTool(actor,'start_work',toolPlan(preset.steps),command('Inspect the property.'))).rejects.toThrow('follow-up');
  await expect(dispatchTool(actor,'start_work',toolPlan(preset.steps),command('Create a task after matching buyers, without research.'))).rejects.toThrow('research');
  await expect(dispatchTool(actor,'start_work',{...toolPlan(preset.steps),maximumCents:0},command('Research new investors and create a task.'))).rejects.toThrow();
  const forged=preset.steps.map(step=>step.capabilityId==='start_synthetic_research'?{...step,input:{...step.input,provider:'openai-web-search-v1'}}:step);
  await expect(dispatchTool(actor,'start_work',toolPlan(forged),command('Research new investors and create a task.'))).rejects.toThrow();
  expect(listWorkRuns(actor)).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
 });
 it('requires CRM-first matching and collection of the child for a complete research assignment',()=>{
  const preset=buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',includeResearch:true});
  expect(()=>validateWorkSteps(actor,preset.steps.filter(step=>step.capabilityId!=='await_synthetic_research'))).toThrow();
  const changed=preset.steps.map(step=>step.capabilityId==='start_synthetic_research'?{...step,input:{...step.input,propertyId:'property-oak'}}:step);
  expect(()=>validateWorkSteps(actor,changed)).toThrow('same property');
  expect(()=>validateWorkSteps(actor,preset.steps.map(step=>step.capabilityId==='await_synthetic_research'?{...step,input:{jobId:'someone-elses-job'}}:step))).toThrow();
 });
 it('returns actual saved work state and never reports a queued request as complete',async()=>{
  const ctx=command(),steps=buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple'}).steps;
  const queued=await dispatchTool(actor,'start_work',toolPlan(steps),ctx);const run=queued.data as WorkRun;
  expect(queued.message).toContain('queued');expect(listTasks(actor)).toHaveLength(3);
  processWorkRuns(actor,10);
  const finished=await dispatchTool(actor,'work_status',{runId:run.id},ctx);expect(finished.message).toContain('completed');expect(finished.message).toContain('Saved your personal follow-up');expect(listTasks(actor)).toHaveLength(4);
  expect(finished.message).toContain('not live AI charges');expect(fetch).not.toHaveBeenCalled();
 });
 it('continues a local saved job in the same typed conversation across channel labels',async()=>{
  const message='Start a workflow for 123 Example Street, review Mike Bennett and save a follow-up task.';
  const started=await chat(actor,message,undefined,'one-work-request','sms'),run=getWorkRun(actor,started.result.artifacts.find(item=>item.type==='work_run')!.id!);
  expect(run.id).toMatch(/^work_/);expect(started.result.message).toContain('queued');
  processWorkRuns(actor,10);
  const status=await chat(actor,'show saved jobs',started.conversation.id,'work-status','slack');
  expect(status.conversation.id).toBe(started.conversation.id);expect(status.result.message).toContain('completed');
  const retried=await chat(actor,message,undefined,'one-work-request','sms');expect(retried.result.artifacts[0].id).toBe(run.id);expect(listWorkRuns(actor)).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('respects an explicit research exclusion in the local starter request',async()=>{
  const result=await chat(actor,'Start a job for 123 Example Street and save a follow-up task without research.',undefined,'no-extra-research');
  const run=getWorkRun(actor,result.result.artifacts.find(item=>item.type==='work_run')!.id!);
  expect(run.steps.some(step=>step.capabilityId==='start_synthetic_research')).toBe(false);expect(run.budget.maximumCents).toBe(50);
 });
 it('withholds saved history and cached tool output when a referenced investor is revoked',async()=>{
  const ctx=command(),steps=buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',investorId:'investor-mike'}).steps;
  const started=await dispatchTool(actor,'start_work',toolPlan(steps),ctx),run=started.data as WorkRun;processWorkRuns(actor,10);
  const output=await dispatchTool(actor,'work_status',{runId:run.id},ctx);addMessage(actor,ctx.conversationId,{role:'assistant',content:output.message,artifacts:output.artifacts});
  const cached=()=>executeRecordedTool(actor,ctx.conversationId,'saved-work-receipt','work_status',{runId:run.id},()=>output,'saved-work-request');cached();
  const before=workContextSnapshot(actor);expect(workRunVisible(actor,run.id)).toBe(true);
  getDb().prepare("UPDATE investors SET owner_id='user-taylor',data=json_set(data,'$.ownerId','user-taylor') WHERE id='investor-mike'").run();
  expect(workRunVisible(actor,run.id)).toBe(false);expect(workContextSnapshot(actor)).not.toEqual(before);
  expect(getConversation(actor,ctx.conversationId).messages.at(-1)?.content).toContain('withheld');expect(()=>cached()).toThrow(/Access.*changed/);
  const current=await dispatchTool(actor,'work_status',{runId:run.id},ctx);expect(current.message).not.toContain('Mike');expect((current.data as WorkRun).contentRestricted).toBe(true);
 });
 it('does not replay an old plan after revision removes its now-revoked source',async()=>{
  const conversation=createConversation(actor),step:WorkStepInput={key:'relationship',capabilityId:'relationship_next_step',input:{investorId:'investor-mike'},dependsOn:[]};
  const run=createWorkRun(actor,{requestId:next(),conversationId:conversation.id,title:'Private prior plan marker',instructions:'Prepare the requested relationship review.',steps:[step]});
  const output=await dispatchTool(actor,'work_status',{runId:run.id});
  addMessage(actor,conversation.id,{role:'assistant',content:output.message,artifacts:output.artifacts});
  const cached=()=>executeRecordedTool(actor,conversation.id,'revision-old-result','work_status',{runId:run.id},()=>output,'revision-old-request');cached();
  reviseWorkRun(actor,run.id,{expectedVersion:run.version,eventKey:next(),title:'Property only now',instructions:'Inspect property facts only.',steps:[{key:'property',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]}]});
  getDb().prepare("UPDATE investors SET owner_id='user-taylor',data=json_set(data,'$.ownerId','user-taylor') WHERE id='investor-mike'").run();
  expect(workRunVisible(actor,run.id)).toBe(true);expect(getWorkRun(actor,run.id).title).toBe('Property only now');
  expect(()=>cached()).toThrow(/Access.*changed/);expect(getConversation(actor,conversation.id).messages.at(-1)?.content).toContain('withheld');
 });
 it('keeps model title provenance private and masks copied context even when steps only read a property',async()=>{
  const ctx=command('Prepare a property inspection job.');
  const output=await dispatchTool(actor,'start_work',{title:'Private relationship context copied into title',steps:[{key:'property',capabilityId:'inspect_property',inputJson:JSON.stringify({propertyId:'property-maple'}),dependsOn:[]}]},ctx);
  const run=output.data as WorkRun;expect(run).not.toHaveProperty('sourceReferences');
  const stored=JSON.parse((getDb().prepare('SELECT data FROM work_runs WHERE id=?').get(run.id) as {data:string}).data) as {sourceReferences:{investors:string[]}};
  expect(stored.sourceReferences.investors).toContain('investor-mike');
  getDb().prepare("UPDATE investors SET owner_id='user-taylor',data=json_set(data,'$.ownerId','user-taylor') WHERE id='investor-mike'").run();
  const restricted=getWorkRun(actor,run.id);expect(restricted.contentRestricted).toBe(true);expect(restricted.title).not.toContain('Private relationship');expect(restricted).not.toHaveProperty('sourceReferences');expect(workRunVisible(actor,run.id)).toBe(false);
  expect(processWorkRuns(actor,3)).toBe(0);expect(getWorkRun(actor,run.id).status).toBe('waiting_for_input');
 });
 it('invalidates model-authored manager prose after role downgrade even when every record stays readable',async()=>{
  getDb().prepare("UPDATE memberships SET role='manager' WHERE user_id='user-other'").run();
  actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'manager'};
  const property={id:'property-other',address:'40 Fictional Office Road',city:'Demo',county:'Cobb',price:100000,beds:2,baths:1,sqft:1000,strategy:'Buy & hold',rehab:'Light',status:'Available',synthetic:true};
  getDb().prepare('INSERT INTO properties VALUES(?,?,?,?,?)').run(property.id,actor.organizationId,actor.officeId,actor.id,JSON.stringify(property));
  const ctx=command('Inspect this property in a saved job.');
  const result=await dispatchTool(actor,'start_work',{title:'Private manager report copied into title',steps:[{key:'property',capabilityId:'inspect_property',inputJson:JSON.stringify({propertyId:property.id}),dependsOn:[]}]},ctx);
  const run=result.data as WorkRun;expect(run).not.toHaveProperty('sourceRole');
  const saved=JSON.parse((getDb().prepare('SELECT data FROM work_runs WHERE id=?').get(run.id) as {data:string}).data) as {sourceRole:string};expect(saved.sourceRole).toBe('manager');
  getDb().prepare("UPDATE memberships SET role='dispositions' WHERE user_id='user-other'").run();actor={...actor,role:'dispositions'};
  const restricted=getWorkRun(actor,run.id);expect(restricted.contentRestricted).toBe(true);expect(restricted.title).not.toContain('Private manager');expect(workRunVisible(actor,run.id)).toBe(false);expect(processWorkRuns(actor,2)).toBe(0);
 });
 it('keeps HTTP starter prices and decisions server-owned with no model approval endpoint',async()=>{
  const create=new NextRequest('http://localhost/api/work',{method:'POST'});
  await expect(workRoute(create,actor,['work'],async()=>({requestId:next(),presetId:'dispositions',propertyId:'property-maple',maximumCents:0}))).rejects.toThrow();
  const response=await workRoute(create,actor,['work'],async()=>({requestId:next(),presetId:'dispositions',propertyId:'property-maple',includeResearch:true}));expect(response?.status).toBe(201);
  const run=await response!.json() as WorkRun;expect(run.status).toBe('waiting_cost_approval');expect(run.budget.maximumCents).toBe(275);
  const list=await workRoute(new NextRequest('http://localhost/api/work'),actor,['work'],async()=>({}));expect(list?.headers.get('cache-control')).toBe('no-store');
  await expect(workRoute(new NextRequest(`http://localhost/api/work/${run.id}`),demoActor('manager'),['work',run.id],async()=>({}))).rejects.toThrow('not found');
 });
 it('requires fresh CRM matching after property facts change and can recover with a revised dependency',()=>{
  const preset=buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',includeResearch:true});
  const run=createWorkRun(actor,{requestId:next(),...preset});decideWorkCost(actor,run.id,{expectedVersion:run.version,eventKey:next(),quoteId:run.budget.quoteId,decision:'approve'});processWorkRuns(actor,2);
  const property=JSON.parse((getDb().prepare("SELECT data FROM properties WHERE id='property-maple'").get() as {data:string}).data) as Property;
  getDb().prepare("UPDATE properties SET data=? WHERE id='property-maple'").run(JSON.stringify({...property,price:property.price+200000}));
  expect(processWorkRuns(actor,1)).toBe(0);const stopped=getWorkRun(actor,run.id);expect(stopped.status).toBe('waiting_for_input');expect(stopped.lastError).toContain('Property facts changed');
  expect(getDb().prepare('SELECT COUNT(*) n FROM research_jobs').get()).toEqual({n:0});expect(stopped.budget.spentCents).toBe(40);
  const fresh:WorkStepInput={...preset.steps.find(step=>step.key==='buyers')!,key:'fresh_buyers'};
  const steps=[...preset.steps.slice(0,2),fresh,...preset.steps.slice(2).map(step=>step.key==='research'?{...step,dependsOn:['property','fresh_buyers']}:step)];
  const revised=reviseWorkRun(actor,run.id,{expectedVersion:stopped.version,eventKey:next(),instructions:'Refresh existing buyers for the changed property before researching new investors.',steps});
  expect(revised.status).toBe('waiting_cost_approval');decideWorkCost(actor,run.id,{expectedVersion:revised.version,eventKey:next(),quoteId:revised.budget.quoteId,decision:'approve'});
  expect(processWorkRuns(actor,2)).toBe(2);expect(getDb().prepare('SELECT COUNT(*) n FROM research_jobs').get()).toEqual({n:1});
  expect(getWorkRun(actor,run.id).steps.find(step=>step.key==='buyers')?.result).toEqual(stopped.steps.find(step=>step.key==='buyers')?.result);
 });
 it('stops pending child research after the property is no longer available',()=>{
  const run=createWorkRun(actor,{requestId:next(),...buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',includeResearch:true})});
  decideWorkCost(actor,run.id,{expectedVersion:run.version,eventKey:next(),quoteId:run.budget.quoteId,decision:'approve'});processWorkRuns(actor,2);
  const property=JSON.parse((getDb().prepare("SELECT data FROM properties WHERE id='property-maple'").get() as {data:string}).data) as Property;
  getDb().prepare("UPDATE properties SET data=? WHERE id='property-maple'").run(JSON.stringify({...property,status:'Under contract'}));
  expect(processWorkRuns(actor,2)).toBe(0);expect(getWorkRun(actor,run.id).status).toBe('waiting_for_input');
  expect(getDb().prepare('SELECT COUNT(*) n FROM research_jobs').get()).toEqual({n:0});
 });
});
