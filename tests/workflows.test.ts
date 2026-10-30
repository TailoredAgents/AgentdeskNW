import { grantTrial,changeSubscription,subscription } from '../src/server/billing';
import { grantLegacyTestWorkforce } from './fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { Actor, Investor } from '../src/lib/contracts';
import type { ReleaseInput } from '../src/lib/intelligence-contracts';
import { closeDb, demoActor, getDb, insertRecord } from '../src/server/db';
import { approvePackage, composePackage, getRelease, handoffPackage, listPackages, listReleases, saveRelease, saveTemplate, updatePackage } from '../src/server/workflows';
import { createDebrief, listDebriefs, proposeDebrief, tomorrowEastern } from '../src/server/debrief';
import { getSmsEntitlement, linkDemoSlackIdentity, requestSmsDelivery, resolveDemoSlackRequest, verifySlackSignature } from '../src/server/channels';
import { assignInvestor, getDisclosure, listBuyBoxes, recordDemoDisclosure } from '../src/server/intelligence';
import { addMessage, createConversation, decideAction, getApproval, getConversation, getInvestor, listApprovals, listTasks, processNotifications, proposeInvestorUpdate, updateSettings } from '../src/server/services';
import { createVoiceSession, executeVoiceTool } from '../src/server/voice';

let actor:Actor,manager:Actor,acquisitions:Actor;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const savannah:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
const input=(change:Partial<ReleaseInput>={}):ReleaseInput=>({propertyId:'property-maple',status:'released',source:'Fictional acquisition email supplied by employee',eventKey:'event-one',propertyType:'Single-family',description:'Fictional three-bedroom renovation opportunity.',notes:'Review supplied assumptions.',mediaUrl:'https://drive.google.com/drive/folders/demo-only',mediaAccess:'public_confirmed',arv:null,repairEstimate:null,economicsSource:'',showingInstructions:'Arrange a demo walkthrough.',authorizedUserIds:['user-alex'],upstreamParty:'Fictional referring wholesaler',upstreamStage:'Under review',downstreamStage:'Released for review',closingStructure:'double',closingAt:null,...change});
beforeEach(()=>{closeDb();process.env.AGENTDESK_DB_PATH=':memory:';actor=demoActor();manager=demoActor('manager');acquisitions=demoActor('acquisitions');updateSettings(actor,{quietHoursStart:0,quietHoursEnd:0});grantLegacyTestWorkforce();});
afterEach(()=>{closeDb();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function release(){return saveRelease(acquisitions,input());}
function compose(investorId='investor-mike'){return composePackage(actor,{investorId,releaseId:release().id,channel:'personal_text'});}
function setDisclosure(status:'signed'|'declined'|'unknown',version='demo-disclosure-v1',expiresAt?:string){return recordDemoDisclosure(manager,'investor-mike',{status,version,documentRef:status==='signed'?'demo:test-evidence':null,expiresAt});}

describe('versioned and scoped property release events',()=>{
 it('defers quiet-hours release and package notices until the worker can deliver them once',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T02:00:00Z'));updateSettings(actor,{quietHoursStart:21,quietHoursEnd:8});const value=release();const draft=composePackage(actor,{investorId:'investor-mike',releaseId:value.id,channel:'email'});processNotifications(actor);
  expect(getDb().prepare("SELECT 1 FROM notifications WHERE dedupe_key LIKE 'release:%'").get()).toBeUndefined();
  vi.setSystemTime(new Date('2026-10-30T13:00:00Z'));processNotifications(actor);processNotifications(actor);
  expect((getDb().prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe_key LIKE 'release:%'").get() as {n:number}).n).toBe(1);expect((getDb().prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?').get(`package-review:${draft.id}`) as {n:number}).n).toBe(1);
 });
 it('does not deliver a deferred release notice after withdrawal',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T02:00:00Z'));updateSettings(actor,{quietHoursStart:21,quietHoursEnd:8});release();saveRelease(acquisitions,input({eventKey:'withdraw',expectedVersion:1,status:'withdrawn'}));vi.setSystemTime(new Date('2026-10-30T13:00:00Z'));processNotifications(actor);expect(getDb().prepare("SELECT 1 FROM notifications WHERE dedupe_key LIKE 'release:%'").get()).toBeUndefined();
 });
 it('stores a durable version, source, configurable transaction fields and private matches',()=>{
  const first=release();expect(first.version).toBe(1);expect(first.closingStructure).toBe('double');expect(first.source).toContain('Fictional');expect(first.matches).toEqual([]);
  expect(getRelease(actor,first.id).matches.length).toBeGreaterThan(0);
  expect(JSON.parse((getDb().prepare('SELECT data FROM property_releases WHERE id=?').get(first.id) as {data:string}).data).matches).toEqual([]);
  expect(listReleases(other)).toEqual([]);expect(()=>getRelease(savannah,first.id)).toThrow('not found');expect(()=>saveRelease(actor,input())).toThrow('Your role');
 });
 it('deduplicates release events and notifications and rejects stale writes',()=>{
  const first=release();expect(release().id).toBe(first.id);expect((getDb().prepare('SELECT COUNT(*) n FROM notifications').get() as {n:number}).n).toBe(1);
  expect(()=>saveRelease(acquisitions,input({notes:'Different data'}))).toThrow('already used');
  expect(()=>saveRelease(acquisitions,input({eventKey:'second'}))).toThrow('current version');
  const second=saveRelease(acquisitions,input({eventKey:'second',expectedVersion:1,notes:'Updated source note'}));expect(second.version).toBe(2);expect(getRelease(actor,first.id).notes).toBe('Updated source note');
  expect(release().version).toBe(1);expect(listReleases(actor)[0].version).toBe(2);
 });
 it('does not disclose other employees’ investors in matches, recipient permissions or notifications',()=>{
  getDb().prepare('INSERT INTO users VALUES(?,?)').run('user-b','Blake Demo');getDb().prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(actor.organizationId,actor.officeId,'user-b','dispositions');
  const second:Actor={...actor,id:'user-b',name:'Blake Demo'};grantTrial(manager,{userId:second.id,features:['buyer-matchmaker']});const privateInvestor:Investor={...getInvestor(actor,'investor-mike'),id:'private-blake',name:'Private Blake Investor',ownerId:second.id};insertRecord(second,'investors',privateInvestor);updateSettings(second,{quietHoursStart:0,quietHoursEnd:0});
  const value=saveRelease(manager,input({authorizedUserIds:[actor.id,second.id],mediaAccess:'recipient_confirmed',permittedMediaInvestorIds:['investor-mike','private-blake']}));
  expect(getRelease(actor,value.id).matches.some(match=>match.investorId==='private-blake')).toBe(false);expect(getRelease(actor,value.id).permittedMediaInvestorIds).toEqual(['investor-mike']);
  expect(getRelease(second,value.id).matches.map(match=>match.investorId)).toEqual(['private-blake']);
  expect((getDb().prepare('SELECT data FROM notifications WHERE owner_id=?').all(actor.id) as {data:string}[]).every(row=>!row.data.includes('Private Blake'))).toBe(true);
 });
 it('restricts unreleased audiences and validates URL credentials and recipient confirmation',()=>{
  const hidden=saveRelease(acquisitions,input({authorizedUserIds:[]}));expect(()=>getRelease(actor,hidden.id)).toThrow('not found');
  expect(()=>saveRelease(manager,input({propertyId:'property-oak',mediaUrl:'http://example.com/photos'}))).toThrow();expect(()=>saveRelease(manager,input({propertyId:'property-oak',mediaUrl:'https://user:pass@example.com/photos'}))).toThrow();
  expect(()=>saveRelease(manager,input({propertyId:'property-oak',eventKey:'recipient',mediaAccess:'recipient_confirmed'}))).toThrow('Select the investors');
 });
});

describe('source-grounded and disclosure-gated deal packages',()=>{
 it('composes known facts, flags missing assumptions, requires approval and never fabricates delivery',()=>{
  const draft=compose();expect(draft.status).toBe('draft');expect(draft.body).toContain('123 Example Street');expect(draft.body).toContain('https://drive.google.com');expect(draft.missing).toContain('ARV assumption');expect(draft.body).not.toContain('ARV assumption: $');
  expect(()=>handoffPackage(actor,draft.id)).toThrow('approve');approvePackage(actor,draft.id);const result=handoffPackage(actor,draft.id);expect(result.package.status).toBe('handed_off');expect(result.package.deliveryStatus).toBe('not_sent');expect(result.text).toBe(draft.body);
  expect(()=>handoffPackage(manager,draft.id)).toThrow('not found');
 });
 it('withholds details before disclosure and blocks unsigned, expired and wrong-version evidence',()=>{
  const blocked=compose('investor-sarah');expect(blocked.status).toBe('blocked');expect(blocked.body).not.toContain('Example');expect(blocked.body).not.toContain('drive.google');expect(blocked.subject).not.toContain('Example');
  expect(()=>approvePackage(actor,blocked.id)).toThrow('blocked');
  setDisclosure('signed');getDb().prepare("UPDATE investor_intelligence SET data=json_set(data,'$.disclosure.version','outdated') WHERE investor_id=?").run('investor-mike');expect(compose().status).toBe('blocked');setDisclosure('signed','demo-disclosure-v1','2020-01-01T00:00:00Z');expect(compose().status).toBe('blocked');setDisclosure('unknown');expect(compose().status).toBe('blocked');
 });
 it('rechecks revocation on listing and copy, including debrief replay results',()=>{
  const draft=compose();approvePackage(actor,draft.id);setDisclosure('declined');expect(()=>handoffPackage(actor,draft.id)).toThrow('approve');expect(listPackages(actor)[0].body).not.toContain('Example Street');
  setDisclosure('signed');const debrief=createDebrief(actor,{recap:'I talked to Mike about 123 Example Street. He asked for the photo link.'});const proposal=proposeDebrief(actor,debrief.id,{});expect(proposal.package?.status).toBe('draft');setDisclosure('declined');expect(proposeDebrief(actor,debrief.id,{}).package?.body).not.toContain('Example Street');
 });
 it('invalidates approved packages when release data or access changes',()=>{
  const draft=compose();approvePackage(actor,draft.id);saveRelease(acquisitions,input({eventKey:'revision',expectedVersion:1,description:'Updated description'}));expect(listPackages(actor)[0].status).toBe('blocked');expect(()=>handoffPackage(actor,draft.id)).toThrow();
  const next=composePackage(actor,{investorId:'investor-mike',releaseId:draft.releaseId,channel:'email'});approvePackage(actor,next.id);saveRelease(acquisitions,input({eventKey:'revoke',expectedVersion:2,authorizedUserIds:[]}));expect(listPackages(actor)[0].body).not.toContain('Example');
 });
 it('cannot approve invented edited facts and removes approval when factual lines are shortened',()=>{
  const draft=compose();approvePackage(actor,draft.id);expect(()=>updatePackage(actor,draft.id,{body:`${draft.body}\nGuaranteed ARV: $900,000`})).toThrow('source package');
  const shortened=draft.body.split('\n').filter(line=>!line.startsWith('Recorded rehab:')).join('\n');expect(updatePackage(actor,draft.id,{body:shortened}).status).toBe('draft');expect(()=>handoffPackage(actor,draft.id)).toThrow('approve');
  expect(()=>updatePackage(actor,draft.id,{subject:'Guaranteed profit $100,000'})).toThrow('source package');
 });
 it('blocks unverified media and binds recipient confirmation to the actual investor',()=>{
  const value=saveRelease(manager,input({mediaAccess:'unverified'}));expect(composePackage(actor,{investorId:'investor-mike',releaseId:value.id,channel:'email'}).status).toBe('blocked');
  saveRelease(manager,input({eventKey:'confirm-media',expectedVersion:1,mediaAccess:'recipient_confirmed',permittedMediaInvestorIds:['investor-sarah']}));expect(composePackage(actor,{investorId:'investor-mike',releaseId:value.id,channel:'email'}).status).toBe('blocked');
 });
 it('uses manager-reviewed demo templates and invalidates changed template versions',()=>{
  expect(()=>saveTemplate(actor,{name:'Mine',channel:'email',intro:'Hello',closing:'Thank you',approved:true})).toThrow('Your role');
  const template=saveTemplate(manager,{name:'Office demo',channel:'personal_text',intro:'Please review the supplied information.',closing:'Let me know your questions.',approved:true});const draft=compose();expect(draft.body).toContain(template.intro);approvePackage(actor,draft.id);
  saveTemplate(manager,{approved:false,id:template.id,name:template.name,channel:template.channel,intro:template.intro,closing:template.closing});expect(listPackages(actor)[0].status).toBe('blocked');
 });
 it('includes sourced fit cautions, distinguishes compact formatting, and invalidates stale personalization',()=>{
  const value=release();const update=proposeInvestorUpdate(actor,'investor-mike',{rehab:'Light / cosmetic'});decideAction(actor,update.id,'approve');
  const short=composePackage(actor,{investorId:'investor-mike',releaseId:value.id,channel:'personal_text'});const email=composePackage(actor,{investorId:'investor-mike',releaseId:value.id,channel:'email'});
  expect(short.body).toContain('Recorded profile comparison:');expect(short.body).toContain('Fit cautions: Property needs more rehab');expect(short.body).not.toContain('\n\n');expect(email.body).toContain('\n\n');expect(email.subject).toContain('Example Street');approvePackage(actor,short.id);
  decideAction(actor,proposeInvestorUpdate(actor,'investor-mike',{rehab:'Heavy'}).id,'approve');expect(()=>handoffPackage(actor,short.id)).toThrow('approve');expect(listPackages(actor).find(item=>item.id===short.id)?.eligibilityReasons.join(' ')).toContain('buying criteria changed');
 });
});

describe('reviewed post-call debrief',()=>{
 it('extracts linked criteria with source excerpts without silently applying updates',()=>{
  const debrief=createDebrief(actor,{recap:"I just talked to Mike about the Marietta property. He's buying cash, wants cosmetic rehabs under $250k in Cobb County, asked for the photos, and wants me to follow up tomorrow."});
  expect(debrief.investorId).toBe('investor-mike');expect(debrief.propertyId).toBe('property-maple');expect(debrief.extractedChanges).toMatchObject({budgetMax:250000,financing:'Cash',rehab:'Light / cosmetic',counties:['Cobb']});expect(debrief.sourceExcerpts.budgetMax).toContain('$250k');expect(debrief.suggestedFollowUpAt).toBeTruthy();
  const before=getInvestor(actor,'investor-mike').budgetMax;const taskCount=listTasks(actor).length;const result=proposeDebrief(actor,debrief.id,{});expect(result.actions).toHaveLength(2);expect(result.tasks).toEqual([]);expect(getInvestor(actor,'investor-mike').budgetMax).toBe(before);expect(listTasks(actor)).toHaveLength(taskCount);
  const action=result.actions.find(item=>item.kind==='crm_update')!;expect(decideAction(actor,action.id,'approve').status).toBe('executed');expect(getInvestor(actor,'investor-mike').budgetMax).toBe(250000);expect(listBuyBoxes(actor,'investor-mike')[0].provenance.statement).toContain('$250k');
  expect(proposeDebrief(actor,debrief.id,{}).actions.map(item=>item.id)).toEqual(result.actions.map(item=>item.id));expect(listApprovals(actor)).toHaveLength(2);
 });
 it('requires ambiguous investor linking and creates requested reminders only once',()=>{
  const debrief=createDebrief(actor,{recap:'I spoke with the buyer. They want cash purchases under $250,000 and a follow up tomorrow.'});expect(debrief.status).toBe('needs_linking');expect(()=>proposeDebrief(actor,debrief.id,{})).toThrow('Select the correct investor');
  const result=proposeDebrief(actor,debrief.id,{investorId:'investor-mike',createFollowUp:true});expect(result.tasks).toHaveLength(1);expect(result.tasks[0].dueAt).toBe(debrief.suggestedFollowUpAt);expect(proposeDebrief(actor,debrief.id,{createFollowUp:true}).tasks[0].id).toBe(result.tasks[0].id);expect(listDebriefs(other)).toEqual([]);
 });
 it('does not promote negated criteria or employee speech to investor facts',()=>{
  const debrief=createDebrief(actor,{investorId:'investor-mike',recap:'Agent: I offered cash and cosmetic rehabs under $200k in Cobb County.\nMike: I am not buying cash or cosmetic rehabs under $250k.\nMike: I prefer rental properties.'});expect(debrief.extractedChanges).toEqual({strategy:'Buy & hold'});expect(debrief.sourceExcerpts.strategy).toContain('Mike:');
 });
 it('does not conflate another named investor with the selected person and reconciles guidance',()=>{
  const debrief=createDebrief(actor,{investorId:'investor-mike',recap:'Mike wants cosmetic flips in Cobb County under $250k using cash. Sarah wants rentals under $150k in Fulton County.'});expect(debrief.extractedChanges).toMatchObject({budgetMax:250000,strategy:'Fix & flip',counties:['Cobb']});expect(debrief.summary.missingInformation).not.toContain('strategy');expect(debrief.summary.suggestedTasks.join(' ')).not.toContain('strategy');expect(debrief.ambiguities.join(' ')).toContain('Another investor');
  const ambiguous=createDebrief(actor,{investorId:'investor-mike',recap:'Mike wants cosmetic rehabs. Sarah discussed rentals. She is buying cash.'});expect(ambiguous.extractedChanges.financing).toBeUndefined();
  const negated=createDebrief(actor,{investorId:'investor-mike',recap:'Mike isn’t buying cash. He didn’t want cosmetic rehabs. He wants properties without heavy rehab. Don’t call him tomorrow.'});expect(negated.extractedChanges).toEqual({});expect(negated.suggestedFollowUpAt).toBeNull();
 });
 it('keeps separate buying profiles separate and does not infer negated followups',()=>{
  const debrief=createDebrief(actor,{investorId:'investor-mike',recap:'Mike wants Cobb flips under $250k and Bartow rentals under $150k. Do not call him tomorrow.'});expect(debrief.extractedChanges).toEqual({});expect(debrief.ambiguities.join(' ')).toContain('separate reviewed buy boxes');expect(debrief.suggestedFollowUpAt).toBeNull();
 });
 it('normalizes tomorrow across Eastern daylight saving changes',()=>{expect(tomorrowEastern(new Date('2026-10-31T16:00:00Z'))).toBe('2026-11-01T15:00:00.000Z');expect(tomorrowEastern(new Date('2026-03-07T16:00:00Z'))).toBe('2026-03-08T14:00:00.000Z');});
});

describe('channel boundaries remain disconnected',()=>{
 it('returns only a duplicate receipt when a voice package result has since lost eligibility',async()=>{
  vi.stubEnv('OPENAI_API_KEY','test-key');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({value:'test-ephemeral'}))));const session=await createVoiceSession(actor);const value=release();const args={investorId:'investor-mike',releaseId:value.id,channel:'email'};
  const first=await executeVoiceTool(actor,session.voiceSessionId,'package-voice','compose_deal_package',args);expect(JSON.stringify(first.data)).toContain('123 Example Street');setDisclosure('declined');const repeated=await executeVoiceTool(actor,session.voiceSessionId,'package-voice','compose_deal_package',args);expect(JSON.stringify(repeated)).not.toContain('Example Street');expect(repeated.data).toMatchObject({duplicate:true,completed:true});
 });
 it('verifies signed Slack raw bodies and resolves only linked memberships',()=>{
  const secret='test-signing-secret';const rawBody=JSON.stringify({team_id:'TDEMO',event:{user:'UDEMO'}});const timestamp=String(Math.floor(Date.now()/1000));const signature=`v0=${createHmac('sha256',secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  expect(verifySlackSignature(rawBody,timestamp,signature,secret)).toBe(true);expect(verifySlackSignature(`${rawBody} `,timestamp,signature,secret)).toBe(false);expect(verifySlackSignature(rawBody,timestamp,signature,secret,Date.now()+400000)).toBe(false);
  expect(()=>resolveDemoSlackRequest({rawBody,timestamp,signature},secret)).toThrow('not linked');linkDemoSlackIdentity(manager,{userId:actor.id,workspaceId:'TDEMO',externalId:'UDEMO'});expect(resolveDemoSlackRequest({rawBody,timestamp,signature},secret)).toEqual(actor);
  expect(()=>linkDemoSlackIdentity(manager,{userId:other.id,workspaceId:'TOTHER',externalId:'UOTHER'})).toThrow('no longer an authorized');
 });
 it('cannot send or incur SMS charges without entitlement or provider',()=>{
  expect(getSmsEntitlement(actor).providerConfigured).toBe(false);expect(()=>requestSmsDelivery(actor)).toThrow('paid add-on');changeSubscription(actor,{selection:{planId:'workforce',addons:['sms']},expectedVersion:subscription(actor).version,eventKey:'sms-test',timing:'now'});expect(()=>requestSmsDelivery(actor)).toThrow('not configured');expect(getSmsEntitlement(actor).used).toBe(0);expect(getDisclosure(actor,'investor-mike').synthetic).toBe(true);
 });
});

describe('conversation snapshots respect current record access',()=>{
 it('hides former-investor approval payloads even on replay and rejection routes',()=>{
  const pending=proposeInvestorUpdate(actor,'investor-mike',{budgetMax:300000});const approved=proposeInvestorUpdate(actor,'investor-mike',{rehab:'Heavy'});decideAction(actor,approved.id,'approve');assignInvestor(manager,'investor-mike',acquisitions.id);
  expect(listApprovals(actor)).toEqual([]);expect(()=>getApproval(actor,pending.id)).toThrow('not found');expect(()=>decideAction(actor,pending.id,'reject')).toThrow('not found');expect(()=>decideAction(actor,approved.id,'approve')).toThrow('not found');expect(listApprovals(manager)).toHaveLength(2);
 });
 it('does not return cached investor/briefing bodies and redacts source-linked messages after reassignment',()=>{
  const conversation=createConversation(actor,'Call briefing');const investor=getInvestor(actor,'investor-mike');addMessage(actor,conversation.id,{role:'assistant',content:'Mike has a recorded budget and private notes.',artifacts:[{type:'briefing',id:investor.id,title:'Mike briefing',data:{investor}}]});expect(getConversation(actor,conversation.id).messages[0].artifacts[0].data).toBeUndefined();
  assignInvestor(manager,investor.id,acquisitions.id);const hidden=getConversation(actor,conversation.id);expect(hidden.messages[0].content).toContain('withheld');expect(hidden.messages[0].artifacts).toEqual([]);
 });
 it('redacts previous package copy and context after disclosure revocation',()=>{
  const draft=compose();const conversation=createConversation(actor,'Package review');addMessage(actor,conversation.id,{role:'assistant',content:draft.body,artifacts:[{type:'package',id:draft.id,title:'Property package'}]});expect(getConversation(actor,conversation.id).messages[0].content).toContain('Example Street');setDisclosure('declined');expect(getConversation(actor,conversation.id).messages[0].content).not.toContain('Example Street');
 });
});
