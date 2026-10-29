import { grantLegacyTestWorkforce } from './fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor, ResearchInput } from '../src/lib/contracts';
import { closeDb, getDb } from '../src/server/db';
import { classifyDuplicate, defaultScoreWeights, scoreProspect, syntheticResearchProvider } from '../src/server/research';
import { specialists } from '../src/server/registry';
import { extractNotes } from '../src/server/notes';
import { DemoCrmAdapter, prepareSalesforceOAuth, SalesforceReadAdapter } from '../src/server/crm';
import { addMessage, cancelJob, completeTask, createConversation, createResearchJob, createTask, decideAction, demoActor, getBootstrap, getConversation, getGuidance, getInvestor, getManagementOverview, getResearchJob, listInvestors, matchBuyers, processAllNotifications, processNotifications, processQueuedJobs, proposeImport, proposeInvestorUpdate, proposeNote, retryJob, summarizeNotes, updateSettings } from '../src/server/services';

const input:ResearchInput={address:'123 Example Street, Marietta, GA',county:'Cobb',price:235000,strategy:'Fix & flip',limit:100};
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const savannah:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
let actor:Actor;
beforeEach(()=>{closeDb();process.env.AGENTDESK_DB_PATH=':memory:';actor=demoActor();grantLegacyTestWorkforce();});
afterEach(()=>{closeDb();vi.useRealTimers();vi.restoreAllMocks();});
function finishJob(id:string){for(let n=0;n<4;n++){getDb().prepare('UPDATE research_jobs SET next_attempt_at=NULL,lease_until=NULL WHERE id=?').run(id);processQueuedJobs(actor);}return getResearchJob(actor,id);}

describe('identity and tenant boundaries',()=>{
 it('isolates organizations and denies forged tenant or role claims',()=>{
  expect(listInvestors(actor)).toHaveLength(3);
  expect(listInvestors(other).map(item=>item.id)).toEqual(['investor-isolated']);
  expect(()=>getInvestor(actor,'investor-isolated')).toThrow('not found');
  expect(()=>listInvestors({...actor,organizationId:'org-isolation'})).toThrow('not authorized');
  expect(()=>getManagementOverview({...actor,role:'manager'})).toThrow('not authorized');
 });
 it('gates management/research roles and isolates offices',()=>{
  expect(()=>getManagementOverview(actor)).toThrow('Your role');
  expect(getManagementOverview(demoActor('manager')).tasks).toHaveLength(3);
  expect(()=>createResearchJob(demoActor('acquisitions'),input)).toThrow('Your role');
  expect(getBootstrap(savannah).properties).toHaveLength(0);
  expect(()=>getInvestor(savannah,'investor-mike')).toThrow('not found');
 });
 it('keeps employee conversations private even from an office manager',()=>{
  const conversation=createConversation(actor);
  expect(()=>getConversation(demoActor('manager'),conversation.id)).toThrow('not found');
  expect(()=>getConversation(other,conversation.id)).toThrow('not found');
 });
 it('enforces database scope with foreign keys as well as application checks',()=>{
  expect(()=>getDb().prepare('INSERT INTO investors VALUES(?,?,?,?,?)').run('bad-record','org-isolation','office-atlanta',actor.id,'{}')).toThrow();
 });
});

describe('conversation persistence and registry',()=>{
 it('persists ordered messages and names new conversations from actual input',()=>{
  const conversation=createConversation(actor);
  addMessage(actor,conversation.id,{role:'user',content:'What should I focus on today?'});
  addMessage(actor,conversation.id,{role:'assistant',content:'You have three open tasks.',specialistIds:['daily-coordinator']});
  const persisted=getConversation(actor,conversation.id);
  expect(persisted.title).toBe('What should I focus on today?');
  expect(persisted.messages.map(message=>message.role)).toEqual(['user','assistant']);
  expect(getBootstrap(actor).conversations[0].messages).toHaveLength(2);
 });
 it('registers all sixteen employees without presenting planned capabilities as operational',()=>{
  expect(specialists).toHaveLength(16);expect(new Set(specialists.map(item=>item.id)).size).toBe(16);
  for(const employee of specialists){expect(employee.inputs.length).toBeGreaterThan(0);expect(employee.outputs.length).toBeGreaterThan(0);expect(employee.approval).toBeTruthy();if(employee.status==='planned')expect(employee.tools).toHaveLength(0);}
  expect(specialists.find(item=>item.id==='investor-hunter')?.status).toBe('demo');
 });
});

describe('evidence-aware research and durable jobs',()=>{
 it('scores explainable evidence and never fabricates verified contact data',()=>{
  const prospects=syntheticResearchProvider.discover(input);
  expect(prospects).toHaveLength(12);
  for(const prospect of prospects){expect(prospect.score).toBeGreaterThanOrEqual(0);expect(prospect.score).toBeLessThanOrEqual(100);expect(prospect.phone).toBeNull();expect(prospect.contactStatus).toBe('missing');expect(prospect.evidence.every(item=>item.synthetic&&item.url===null)).toBe(true);expect(prospect.synthetic).toBe(true);}
  expect(Object.values(defaultScoreWeights).reduce((sum,n)=>sum+n,0)).toBe(100);
  const exact=prospects.find(item=>item.company==='Maple Hill Restoration')!;
  const far=scoreProspect({...exact,county:'DeKalb'},input);
  expect(exact.score).toBeGreaterThan(far.score);
  expect(scoreProspect({...exact,lastActivityAt:'2099-01-01T00:00:00.000Z'},input).scoreBreakdown.recency).toBe(0);
  expect(()=>scoreProspect(exact,input,{...defaultScoreWeights,geography:-1})).toThrow();
 });
 it('classifies normalized exact and possible company duplicates',()=>{
  const investors=listInvestors(actor);
  expect(classifyDuplicate({company:'PEACHTREE RENEWAL, L.L.C.',name:'Mike Bennett'},investors).duplicateStatus).toBe('existing');
  expect(classifyDuplicate({company:'Peachtree Renewal LLC',name:'Mike Bennett'},investors).duplicateStatus).toBe('existing');
  expect(classifyDuplicate({company:'Oakline Property Group Holdings',name:'Alex Porter'},investors).duplicateStatus).toBe('possible_duplicate');
  expect(classifyDuplicate({company:'',name:''},investors).duplicateStatus).toBe('uncertain');
 });
 it('normalizes strategy and county aliases and supports both investment strategies',()=>{
  const fixed=new Date('2026-10-29T15:00:00.000Z');
  const flip=syntheticResearchProvider.discover(input).find(item=>item.strategy==='Fix & flip')!;
  const rental=syntheticResearchProvider.discover(input).find(item=>item.strategy==='Buy & hold')!;
  const canonical=scoreProspect(flip,input,defaultScoreWeights,fixed);
  const alias=scoreProspect(flip,{...input,strategy:'fix-and-flip',county:'Cobb County'},defaultScoreWeights,fixed);
  expect(alias.score).toBe(canonical.score);expect(alias.scoreBreakdown.strategy).toBe(20);expect(alias.rationale).toContain('matching strategy');
  expect(scoreProspect(rental,{...input,strategy:'buy-and-hold'}).scoreBreakdown.strategy).toBe(20);
  expect(scoreProspect(flip,{...input,strategy:'both'}).scoreBreakdown.strategy).toBe(20);
  expect(scoreProspect(rental,{...input,strategy:'both'}).scoreBreakdown.strategy).toBe(20);
 });
 it('persists real job stages and returns only the available synthetic sample size',()=>{
  const job=createResearchJob(actor,input);expect(job.status).toBe('queued');
  processQueuedJobs(actor);const running=getResearchJob(actor,job.id);expect(running.status).toBe('running');expect(running.progress).toBe(20);
  const complete=finishJob(job.id);expect(complete.status).toBe('completed');expect(complete.progress).toBe(100);expect(complete.prospects).toHaveLength(12);
  expect(complete.prospects.some(prospect=>prospect.duplicateStatus==='existing')).toBe(true);
  expect(()=>getResearchJob(other,job.id)).toThrow('not found');
  processQueuedJobs(actor);expect(getBootstrap(actor).usage.find(item=>item.kind==='research_jobs')?.quantity).toBe(1);
 });
 it('supports cancellation, retry, and missing-input recovery',()=>{
  const job=createResearchJob(actor,input);cancelJob(actor,job.id);processQueuedJobs(actor);expect(getResearchJob(actor,job.id).status).toBe('canceled');
  retryJob(actor,job.id);expect(finishJob(job.id).status).toBe('completed');
  expect(()=>cancelJob(actor,job.id)).toThrow('Only queued');
  const missing=createResearchJob(actor,{...input,county:'',price:0});expect(missing.status).toBe('awaiting_input');
  expect(()=>retryJob(actor,missing.id)).toThrow('Provide county');
  retryJob(actor,missing.id,input);expect(finishJob(missing.id).status).toBe('completed');
 });
 it('honors an active lease then resumes after expiry without duplicated completion',()=>{
  const job=createResearchJob(actor,input);
  getDb().prepare('UPDATE research_jobs SET lease_until=? WHERE id=?').run('2099-01-01T00:00:00.000Z',job.id);
  expect(processQueuedJobs(actor)).toBe(0);
  getDb().prepare('UPDATE research_jobs SET lease_until=? WHERE id=?').run('2000-01-01T00:00:00.000Z',job.id);
  expect(processQueuedJobs(actor)).toBe(1);expect(finishJob(job.id).status).toBe('completed');
 });
 it('persists a safe failure and retries when the provider recovers',()=>{
  const spy=vi.spyOn(syntheticResearchProvider,'discover').mockImplementation(()=>{throw new Error('secret-provider-detail');});
  const job=finishJob(createResearchJob(actor,input).id);expect(job.status).toBe('failed');expect(job.error).not.toContain('secret-provider-detail');
  spy.mockRestore();retryJob(actor,job.id);expect(finishJob(job.id).status).toBe('completed');
 });
});

describe('notes, human approval, and local CRM integrity',()=>{
 const transcript="Agent: What is your budget?\nMike: My budget is $250,000 and I prefer Cobb County. I use cash and want a fix and flip with light rehab. I want to buy within 30 days.\nAgent: I will send the property details tomorrow.\nMike: I am concerned about structural repairs.";
 it('extracts source statements, commitments and missing facts without claiming verification',()=>{
  const notes=summarizeNotes(actor,transcript);
  expect(notes.mode).toBe('local_extraction');expect(notes.source).toBe('employee_transcript');expect(notes.criteria.budget).toContain('$250,000');expect(notes.commitments[0]).toContain('I will send');expect(notes.objections).toHaveLength(1);expect(notes.questions).toHaveLength(1);
  expect(notes.sourceExcerpts.every(excerpt=>transcript.includes(excerpt))).toBe(true);
  expect(extractNotes('Buyer: I have not decided my budget and cannot use cash.').criteria.financing).toContain('cannot use cash');
  expect(()=>summarizeNotes(actor,'short')).toThrow();
 });
 it('does not mutate CRM until approval and makes repeated approval idempotent',()=>{
  const before=getInvestor(actor,'investor-mike').notes;
  const originalContactDate=getInvestor(actor,'investor-mike').lastContactAt;
  const proposal=proposeNote(actor,'investor-mike',summarizeNotes(actor,transcript));
  expect(proposal.status).toBe('pending');expect(getInvestor(actor,'investor-mike').notes).toBe(before);
  expect(()=>decideAction(other,proposal.id,'approve')).toThrow('not found');
  const executed=decideAction(actor,proposal.id,'approve');expect(executed.status).toBe('executed');
  const written=getInvestor(actor,'investor-mike').notes;expect(written).toContain('$250,000');
  decideAction(actor,proposal.id,'approve');expect(getInvestor(actor,'investor-mike').notes).toBe(written);
  expect(getInvestor(actor,'investor-mike').lastContactAt).toBe(originalContactDate);
 });
 it('keeps long extraction output within the review request limits',()=>{
  const long=('Buyer: My budget is $250,000 in Cobb County. I will send cash funding details for my rehab and flip within 30 days. I am concerned about repairs.\n').repeat(300);
  const notes=summarizeNotes(actor,long);
  expect(JSON.stringify(notes).length).toBeLessThan(90000);
  expect(notes.sourceExcerpts.every(excerpt=>excerpt.length<=5000)).toBe(true);
  expect(proposeNote(actor,'investor-mike',notes).status).toBe('pending');
 });
 it('rejects proposals without changes and fails stale updates',()=>{
  const proposal=proposeInvestorUpdate(actor,'investor-mike',{timeframe:'30 days'});
  expect(decideAction(actor,proposal.id,'reject').status).toBe('rejected');expect(getInvestor(actor,'investor-mike').timeframe).toBeNull();
  const first=proposeInvestorUpdate(actor,'investor-mike',{timeframe:'60 days'});const stale=proposeInvestorUpdate(actor,'investor-mike',{timeframe:'90 days'});
  expect(decideAction(actor,first.id,'approve').status).toBe('executed');expect(decideAction(actor,stale.id,'approve').status).toBe('failed');expect(getInvestor(actor,'investor-mike').timeframe).toBe('60 days');
 });
 it('checks duplicates again at execution and rolls back the entire conflicting batch',()=>{
  const job=finishJob(createResearchJob(actor,input).id);const candidates=job.prospects.filter(item=>item.duplicateStatus==='net_new');
  const batch=proposeImport(actor,job.id,[candidates[0].id,candidates[1].id]);
  const competing=proposeImport(actor,job.id,[candidates[1].id]);
  expect(decideAction(actor,competing.id,'approve').status).toBe('executed');
  expect(decideAction(actor,batch.id,'approve').status).toBe('failed');
  expect(listInvestors(actor)).toHaveLength(4);expect(listInvestors(actor).find(item=>item.company===candidates[0].company)).toBeUndefined();
  const existing=job.prospects.find(item=>item.duplicateStatus==='existing')!;
  expect(()=>proposeImport(actor,job.id,[existing.id])).toThrow('Only identified net-new');
 });
});

describe('context, tasks, and notifications',()=>{
 it('derives next steps from missing fields and matches actual authorized CRM buyers',()=>{
  expect(getGuidance(actor,'investor-mike').missing).toContain('purchase timeline');
  expect(getGuidance(actor,'investor-mike').source).toContain('not approved New Western');
  const match=matchBuyers(actor,'property-maple');expect(match.matches[0].score).toBe(100);expect(match.matches[0].investor.synthetic).toBe(true);
  expect(getGuidance(actor).investor).toBeNull();expect(getGuidance(actor).missing).toContain('investor identity');
 });
 it('persists validated reminders, prevents cross-tenant linkage and deduplicates notices',()=>{
  updateSettings(actor,{quietHoursStart:0,quietHoursEnd:0,notifications:true});
  const task=createTask(actor,{title:'Call Mike',dueAt:'2026-01-01T12:00:00.000Z',investorId:'investor-mike'});
  expect(()=>createTask(actor,{title:'Unauthorized',investorId:'investor-isolated'})).toThrow('not found');
  expect(()=>createTask(actor,{title:'Bad date',dueAt:'tomorrow'})).toThrow();
  processNotifications(actor);processNotifications(actor);
  expect(getBootstrap(actor).notifications.filter(item=>item.body==='Call Mike')).toHaveLength(1);
  completeTask(actor,task.id);expect(getBootstrap(actor).tasks.find(item=>item.id===task.id)?.status).toBe('completed');
  expect(()=>completeTask(other,task.id)).toThrow('not found');
 });
 it('respects notification opt-out until enabled',()=>{
  updateSettings(actor,{notifications:false,quietHoursStart:0,quietHoursEnd:0});createTask(actor,{title:'Muted reminder',dueAt:'2026-01-01T12:00:00.000Z'});processNotifications(actor);
  expect(getBootstrap(actor).notifications).toHaveLength(0);
  updateSettings(actor,{notifications:true});processNotifications(actor);expect(getBootstrap(actor).notifications.some(item=>item.body==='Muted reminder')).toBe(true);
 });
 it('checks reminders without any active research and normalizes offset timestamps',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T14:00:00.000Z'));
  updateSettings(actor,{notifications:true,quietHoursStart:0,quietHoursEnd:0});
  const future=createTask(actor,{title:'Afternoon offset reminder',dueAt:'2026-10-29T11:30:00-04:00'});
  const due=createTask(actor,{title:'Morning offset reminder',dueAt:'2026-10-29T09:30:00-04:00'});
  expect(future.dueAt).toBe('2026-10-29T15:30:00.000Z');expect(due.dueAt).toBe('2026-10-29T13:30:00.000Z');
  expect(processQueuedJobs()).toBe(0);expect(processAllNotifications()).toBeGreaterThan(0);
  const notices=getBootstrap(actor).notifications;
  expect(notices.some(notice=>notice.body===due.title)).toBe(true);expect(notices.some(notice=>notice.body===future.title)).toBe(false);
 });
});

describe('CRM integration boundary',()=>{
 it('routes demo reads through the same tenant scope',async()=>{
  const adapter=new DemoCrmAdapter();
  expect(await adapter.searchInvestors(actor,'Peachtree')).toHaveLength(1);
  await expect(adapter.getInvestor(other,'investor-mike')).rejects.toThrow('not found');
 });
 it('prepares randomized OAuth state and PKCE only for a valid callback',()=>{
  const first=prepareSalesforceOAuth({clientId:'configured-client',redirectUri:'http://127.0.0.1:3000/api/oauth/callback',sandbox:true});
  const second=prepareSalesforceOAuth({clientId:'configured-client',redirectUri:'https://agentdesk.example/oauth/callback',sandbox:false});
  expect(new URL(first.authorizationUrl).hostname).toBe('test.salesforce.com');
  expect(new URL(first.authorizationUrl).searchParams.get('code_challenge')).toBeTruthy();
  expect(first.state).not.toBe(second.state);expect(first.verifier).not.toBe(second.verifier);
  expect(()=>prepareSalesforceOAuth({clientId:'x',redirectUri:'http://public.example/oauth',sandbox:true})).toThrow('HTTPS');
 });
 it('rejects arbitrary outbound hosts, injected mappings, and a foreign connection',async()=>{
  const connection={organizationId:actor.organizationId,officeId:actor.officeId,userId:actor.id,instanceUrl:'https://sample.my.salesforce.com',getAccessToken:async()=>'',apiVersion:'v65.0',mapping:{investorObject:'Contact',id:'Id',displayName:'Name',owner:'OwnerId'},salesforceUserId:'005000000000001AAA'};
  expect(()=>new SalesforceReadAdapter({...connection,instanceUrl:'https://attacker.example'})).toThrow('Salesforce instance');
  expect(()=>new SalesforceReadAdapter({...connection,mapping:{...connection.mapping,investorObject:'Contact WHERE Id != null'}})).toThrow();
  await expect(new SalesforceReadAdapter(connection).readAssignedInvestorRecords(other)).rejects.toThrow('another employee');
  await expect(new SalesforceReadAdapter(connection).readAssignedInvestorRecords(actor)).rejects.toThrow('authorization is missing');
 });
});
