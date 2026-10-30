import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Bootstrap,Conversation,ToolResult } from '../src/lib/contracts';
import type { EmployeeMemory } from '../src/lib/memory-contracts';
import type { InvestorJourney,InvestorNextStep,JourneyObservation } from '../src/lib/journey-contracts';
import type { ProviderStatus } from '../src/lib/provider-contracts';

const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3000';
const runId=`intelligence-smoke-${randomUUID()}`;
let cookie='',checks=0;
type ChatResult={conversation:Conversation;result:ToolResult};
async function request<T>(path:string,method='GET',value?:unknown,expected=200):Promise<T>{
 const response=await fetch(`${base}/api/${path}`,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:value===undefined?undefined:JSON.stringify(value)});
 const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
 const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text}`);checks++;return text?JSON.parse(text) as T:undefined as T;
}
function check(condition:unknown,message:string){assert.ok(condition,message);checks++;}
function assertBlankMemory(memory:EmployeeMemory){
 assert.equal(memory.tone,null);assert.equal(memory.length,null);assert.deepEqual(memory.avoidPhrases,[]);assert.deepEqual(memory.priorities,[]);assert.deepEqual(memory.sources,{});checks++;
}
const recommendation=()=>request<InvestorNextStep>('investors/investor-mike/recommendation','POST',{propertyId:null});

// This suite expects the disposable demo database created by smoke-runner.mjs.
for(const path of ['memory','investors/investor-mike/journey'])await request(path,'GET',undefined,401);
await request('investors/investor-mike/recommendation','POST',{propertyId:null},401);
const start=await request<Bootstrap>('bootstrap');
assert.equal(start.actor.role,'dispositions');assert.equal(start.specialists.length,16);assert.equal(start.integrations.crm,'demo');
check(!start.integrations.openai&&!start.integrations.voice,'Isolated smoke must disable AI providers before issuing any chat command');
const providerStart=await request<ProviderStatus>('providers');assert.equal(providerStart.text.state,'setup_required');assert.equal(providerStart.usage.operations,0);
const originalInvestor=start.investors.find(investor=>investor.id==='investor-mike');assert.ok(originalInvestor);check(originalInvestor.synthetic,'Only the fictional Mike fixture is used');
assertBlankMemory(await request<EmployeeMemory>('memory'));
await request('investors/investor-mike/recommendation','POST',{propertyId:null},402);
await request('billing/trial','POST',{userId:start.actor.id,features:['investor-relationship']},403);

// Exercise the real manager trial API; no entitlement bypass or provider call.
const employeeCookie=cookie;
await request('session','POST',{role:'manager'});
const manager=await request<Bootstrap>('bootstrap');
for(const userId of [start.actor.id,manager.actor.id])await request('billing/trial','POST',{userId,features:['investor-relationship'],days:90});
cookie=employeeCookie;

const initialJourney=await request<InvestorJourney>('investors/investor-mike/journey');
assert.equal(initialJourney.investorName,'Mike Bennett');assert.equal(initialJourney.synthetic,true);assert.equal(initialJourney.openIssues.length,0);
check(initialJourney.evidence.some(item=>item.verification==='seeded_demo'),'Initial journey exposes fixture provenance');
const baseline=await recommendation();check(baseline.draftEligibility.allowed&&!!baseline.draft,'A relationship-only baseline draft is available');assert.equal(baseline.deliveryStatus,'not_sent');

const observationMessage='Remember an objection for Mike: Repair costs were unclear';
const observationTurn={requestId:`${runId}-objection`,message:observationMessage};
const recorded=await request<ChatResult>('chat','POST',observationTurn);
assert.match(recorded.result.message,/recorded your objection/i);
const recordedReplay=await request<ChatResult>('chat','POST',observationTurn);assert.equal(recordedReplay.conversation.id,recorded.conversation.id);assert.deepEqual(recordedReplay.result.artifacts,recorded.result.artifacts);
const learnedJourney=await request<InvestorJourney>('investors/investor-mike/journey');
const reports=learnedJourney.observations.filter(item=>item.kind==='objection'&&item.text==='Repair costs were unclear');assert.equal(reports.length,1);
const observation=reports[0];assert.equal(observation.verification,'employee_reported');assert.equal(observation.status,'open');
check(learnedJourney.evidence.some(item=>item.sourceRecordId===observation.id&&item.verification==='employee_reported'),'The new concern is tied to its employee-reported source');
const learned=await recommendation();assert.equal(learned.action.kind,'resolve_objection');assert.match(learned.action.description,/repair scope/i);assert.ok(learned.draft);assert.equal(learned.deliveryStatus,'not_sent');
check(learned.why.some(reason=>reason.includes(observation.id)),'The recommendation cites the concern it is responding to');
check(learned.unknowns.some(item=>/does not establish the actual repair/.test(item)),'The concern is not presented as verified repair economics');

const preferenceMessage='Remember: keep my messages short and direct';
const styled=await request<ChatResult>('chat','POST',{requestId:`${runId}-style`,conversationId:recorded.conversation.id,message:preferenceMessage});
assert.equal(styled.conversation.id,recorded.conversation.id);assert.match(styled.result.message,/remembered/i);
const savedMemory=await request<EmployeeMemory>('memory');assert.equal(savedMemory.tone,'direct');assert.equal(savedMemory.length,'concise');assert.equal(savedMemory.sources.tone?.text,preferenceMessage);assert.equal(savedMemory.sources.length?.text,preferenceMessage);check(!!savedMemory.updatedAt,'The saved correction has a capture time');
const concise=await recommendation();assert.ok(concise.draft);assert.equal(concise.action.kind,learned.action.kind);assert.equal(concise.preferencesUsed.version,savedMemory.version);assert.equal(concise.preferencesUsed.length,'concise');assert.equal(concise.preferencesUsed.tone,'direct');
check(concise.draft.length<learned.draft.length,'The next draft is shorter after the explicit style correction');assert.notEqual(concise.draft,learned.draft);assert.match(concise.draft,/^Mike,/);

const edited=await request<EmployeeMemory>('memory','PATCH',{tone:'warm',sourceText:'Smoke: explicit tone correction',expectedVersion:savedMemory.version});assert.equal(edited.version,savedMemory.version+1);assert.equal(edited.tone,'warm');assert.equal(edited.sources.length?.text,preferenceMessage);
await request('memory','PATCH',{length:'detailed',expectedVersion:savedMemory.version},409);
assert.deepEqual(await request<EmployeeMemory>('memory'),edited);
await request('memory','PATCH',{tone:'direct',userId:manager.actor.id,expectedVersion:edited.version},400);

// Personal preferences/conversations stay private; the permitted relationship report is shared.
await request('session','POST',{role:'manager'});
assertBlankMemory(await request<EmployeeMemory>('memory'));
const managerMemory=await request<EmployeeMemory>('memory','PATCH',{tone:'warm',length:'detailed',priorities:['Review office follow-through'],expectedVersion:0});
await request(`conversations/${recorded.conversation.id}`,'GET',undefined,404);
const managerJourney=await request<InvestorJourney>('investors/investor-mike/journey');
check(managerJourney.observations.some(item=>item.id===observation.id),'The office manager can inspect the shared relationship observation');
check(!managerJourney.commitments.some(task=>task.ownerId===start.actor.id),'The relationship view does not leak another employee’s private task');
const managerNext=await recommendation();assert.equal(managerNext.preferencesUsed.length,'detailed');assert.deepEqual(managerNext.preferencesUsed.priorities,managerMemory.priorities);
await request('session','POST',{role:'acquisitions'});
assertBlankMemory(await request<EmployeeMemory>('memory'));
await request('investors/investor-mike/recommendation','POST',{propertyId:null},403);
await request('investors/investor-mike/journey/observations','POST',{kind:'objection',text:'Not an authorized relationship write',eventKey:`${runId}-denied`},403);
cookie=employeeCookie;
assert.deepEqual(await request<EmployeeMemory>('memory'),edited);
assert.equal((await request<Conversation>(`conversations/${recorded.conversation.id}`)).id,recorded.conversation.id);

await request('memory','DELETE',{expectedVersion:savedMemory.version},409);
const forgotten=await request<EmployeeMemory>('memory','DELETE',{expectedVersion:edited.version});assertBlankMemory(forgotten);assert.equal(forgotten.version,edited.version+1);check(!!forgotten.forgottenAt,'Forget persists a versioned tombstone');
assert.deepEqual(await request<EmployeeMemory>('memory'),forgotten);
const defaultAgain=await recommendation();assert.equal(defaultAgain.preferencesUsed.version,forgotten.version);assert.equal(defaultAgain.preferencesUsed.tone,null);assert.equal(defaultAgain.preferencesUsed.length,null);assert.equal(defaultAgain.draft,learned.draft);

const resolutionInput={kind:'resolved',resolvesId:observation.id,text:'Mike reviewed the sourced repair breakdown and reported that his repair-cost concern is resolved.',eventKey:`${runId}-resolution`};
const resolution=await request<JourneyObservation>('investors/investor-mike/journey/observations','POST',resolutionInput,201);assert.equal(resolution.resolvesId,observation.id);assert.equal(resolution.verification,'employee_reported');
const resolutionReplay=await request<JourneyObservation>('investors/investor-mike/journey/observations','POST',resolutionInput,201);assert.equal(resolutionReplay.id,resolution.id);
await request('investors/investor-mike/journey/observations','POST',{...resolutionInput,text:'Different report with the same event key'},409);
const resolvedJourney=await request<InvestorJourney>('investors/investor-mike/journey');
const resolvedOriginal=resolvedJourney.observations.find(item=>item.id===observation.id);assert.equal(resolvedOriginal?.status,'resolved');assert.equal(resolvedOriginal?.resolvedById,resolution.id);assert.equal(resolvedOriginal?.text,observation.text);
check(!resolvedJourney.openIssues.some(item=>item.id===observation.id),'Resolution removes the original concern from open issues without erasing its history');
const resolvedNext=await recommendation();assert.notEqual(resolvedNext.action.kind,'resolve_objection');assert.equal(resolvedNext.action.kind,baseline.action.kind);assert.equal(resolvedNext.deliveryStatus,'not_sent');
check(resolvedNext.evidence.some(item=>item.sourceRecordId===observation.id&&item.label.includes('resolved')),'The next recommendation preserves the correction’s provenance');
const finalState=await request<Bootstrap>('bootstrap');assert.deepEqual(finalState.investors.find(investor=>investor.id==='investor-mike'),originalInvestor);assert.equal(finalState.approvals.length,start.approvals.length);assert.equal(finalState.tasks.length,start.tasks.length);
const providers=await request<ProviderStatus>('providers');assert.equal(providers.usage.operations,0);
console.info(`PASS: ${checks} intelligence HTTP checks. Explicit concern → sourced recommendation → remembered writing correction → shorter draft; version conflicts and forget; exact concern resolution and replay; private employee memory/conversations with scoped relationship sharing. No CRM changes, investor messages, or AI provider calls.`);
