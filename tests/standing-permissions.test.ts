import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInboxState,getInboxThread,receiveDemoCommunication,linkInboxInvestor} from '../src/server/communications';
import {standingPermissionState,grantStandingPermission,revokeStandingPermission,processStandingPermissions} from '../src/server/standing-permissions';
import {listTasks} from '../src/server/services';
import {getWalletState} from '../src/server/wallet';
import {subscription,simulateLifecycle} from '../src/server/billing';
let seq=0;const key=()=>`standing-${++seq}`,actor=()=>demoActor();
function thread(company=false){const state=getInboxState(actor());return state.threads.find(t=>t.correspondent.address==='mike@example.com'&&state.accounts.find(a=>a.id===t.accountId)?.provider===(company?'salesforce':'gmail'))!;}
function grant(company=false,overrides:Record<string,unknown>={}){const id=thread(company).id,preview=standingPermissionState(actor(),id).preview!;return grantStandingPermission(actor(),id,{...preview,...overrides,eventKey:key()});}
function incoming(company=false){return receiveDemoCommunication(actor(),{scenarioId:company?'company-repair-followup':'mike-repair-followup',eventKey:key()});}
beforeEach(()=>{closeDb();seq=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No network');}));});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('employee-scoped standing permission for routine personal work',()=>{
 it('ignores old messages, then creates one real personal task for a new reply without charging or sending',()=>{
  const before=listTasks(actor()).length,wallet=getWalletState(actor()),permission=grant();expect(processStandingPermissions(actor())).toBe(0);incoming();expect(processStandingPermissions(actor())).toBe(1);expect(processStandingPermissions(actor())).toBe(0);
  const tasks=listTasks(actor());expect(tasks).toHaveLength(before+1);expect(tasks.find(t=>t.title===permission.title)).toMatchObject({investorId:'investor-mike',dueAt:'2026-11-01T15:00:00.000Z'});expect(getWalletState(actor())).toEqual(wallet);expect(fetch).not.toHaveBeenCalled();expect(getDb().prepare("SELECT COUNT(*) n FROM communication_messages WHERE json_extract(data,'$.direction')='outbound'").get()).toEqual({n:0});
 });
 it('coalesces nearby replies, respects frequency and stops at the reviewed count',()=>{
  grant(false,{maxActions:2});incoming();expect(processStandingPermissions(actor())).toBe(1);incoming();expect(processStandingPermissions(actor())).toBe(0);vi.setSystemTime(Date.now()+7*3600000);incoming();expect(processStandingPermissions(actor())).toBe(1);vi.setSystemTime(Date.now()+7*3600000);incoming();expect(processStandingPermissions(actor())).toBe(0);expect(standingPermissionState(actor(),thread().id).permissions[0].state).toBe('exhausted');
 });
 it('keeps grant/revoke retries exact and never creates a second permission from a lost response',()=>{
  const id=thread().id,input={...standingPermissionState(actor(),id).preview!,eventKey:key()},permission=grantStandingPermission(actor(),id,input);expect(grantStandingPermission(actor(),id,input).id).toBe(permission.id);expect(()=>grantStandingPermission(actor(),id,{...input,title:'Different permission'})).toThrow('different decision');
  const revoke={expectedVersion:permission.version,eventKey:key()};expect(revokeStandingPermission(actor(),permission.id,revoke).state).toBe('revoked');expect(revokeStandingPermission(actor(),permission.id,revoke).version).toBe(2);incoming();expect(processStandingPermissions(actor())).toBe(0);
 });
 it('does not permit a manager, another office or another thread to change private permission',()=>{
  const permission=grant();expect(()=>revokeStandingPermission(demoActor('manager'),permission.id,{expectedVersion:1,eventKey:key()})).toThrow('not found');expect(()=>revokeStandingPermission({...actor(),officeId:'other'},permission.id,{expectedVersion:1,eventKey:key()})).toThrow();expect(()=>revokeStandingPermission(actor(),permission.id,{expectedVersion:1,eventKey:key()},thread(true).id)).toThrow('this conversation');
 });
 it('retires authority after source withdrawal and does not restore it with mailbox access',()=>{
  const permission=grant(true);receiveDemoCommunication(actor(),{scenarioId:'company-revoke-access',eventKey:key()});expect(processStandingPermissions(actor())).toBe(0);receiveDemoCommunication(actor(),{scenarioId:'company-restore-access',eventKey:key()});incoming(true);expect(processStandingPermissions(actor())).toBe(0);expect(standingPermissionState(actor(),thread(true).id).permissions.find(p=>p.id===permission.id)?.state).toBe('blocked');
 });
 it('rejects changed account or relationship scope between review and grant',()=>{
  const id=thread().id,input={...standingPermissionState(actor(),id).preview!,eventKey:key()};const detail=getInboxThread(actor(),id);linkInboxInvestor(actor(),id,{investorId:null,expectedVersion:detail.thread.version,eventKey:key()});expect(()=>grantStandingPermission(actor(),id,input)).toThrow('access changed');
 });
 it('blocks a previously granted routine after a relationship reassignment',()=>{
  grant();const detail=getInboxThread(actor(),thread().id);linkInboxInvestor(actor(),detail.thread.id,{investorId:null,expectedVersion:detail.thread.version,eventKey:key()});incoming();expect(processStandingPermissions(actor())).toBe(0);expect(standingPermissionState(actor(),thread().id).permissions[0].state).toBe('blocked');
 });
 it('never grants send, CRM, budget, actor or unlimited-expiry authority',()=>{
  const id=thread().id,input={...standingPermissionState(actor(),id).preview!,eventKey:key()};for(const extra of [{action:'send_email'},{budgetCents:100},{userId:'other'},{maxActions:100000}])expect(()=>grantStandingPermission(actor(),id,{...input,...extra} as never)).toThrow();expect(()=>grantStandingPermission(actor(),id,{...input,expiresAt:'2030-01-01T00:00:00Z'})).toThrow('31 days');
 });
 it('stops expired grants and lost entitlements without consuming replies or AI credits',()=>{
  grant(false,{expiresAt:new Date(Date.now()+60000).toISOString()});vi.setSystemTime(Date.now()+120000);incoming();expect(processStandingPermissions(actor())).toBe(0);expect(standingPermissionState(actor(),thread().id).permissions[0].state).toBe('expired');grant();simulateLifecycle(demoActor('manager'),{userId:actor().id,action:'cancel_now',expectedVersion:subscription(actor()).version,eventKey:key()});expect(processStandingPermissions(actor())).toBe(0);
 });
 it('keeps effects and receipt atomic on failure so a subsequent tick cannot duplicate a task',()=>{
  grant();incoming();const before=listTasks(actor()).length;getDb().exec("CREATE TRIGGER fixture_receipt_failure BEFORE INSERT ON standing_permission_receipts BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");expect(()=>processStandingPermissions(actor())).toThrow('fixture failure');expect(listTasks(actor())).toHaveLength(before);getDb().exec('DROP TRIGGER fixture_receipt_failure');expect(processStandingPermissions(actor())).toBe(1);expect(listTasks(actor())).toHaveLength(before+1);expect(processStandingPermissions(actor())).toBe(0);
 });
});

it('normalizes offset expiry before the worker compares UTC timestamps',()=>{
 const permission=grant(false,{expiresAt:'2026-10-31T12:00:00-04:00'});expect(permission.expiresAt).toBe('2026-10-31T16:00:00.000Z');incoming();expect(processStandingPermissions(actor())).toBe(1);
});
