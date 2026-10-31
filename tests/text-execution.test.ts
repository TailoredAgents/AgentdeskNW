import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {closeDb,demoActor,getDb,now} from '../src/server/db';
import {createConversation,listTasks,createTask} from '../src/server/services';
import {bindAssignment,withAssignment,currentAssignment} from '../src/server/assignment-roots';
import {fingerprint,providerOperations} from '../src/server/provider-runtime';
import {runLiveText} from '../src/server/text-runtime';
import * as checkpoints from '../src/server/text-execution';
import * as history from '../src/server/history';
import {usageBalances} from '../src/server/metering';
import type {Artifact,ToolResult} from '../src/lib/contracts';

let directory='',sequence=0;const key=()=>`text-state-${++sequence}`;
const response=(output:unknown[],patch:Record<string,unknown>={})=>new Response(JSON.stringify({id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:40},...patch}));
const final=()=>response([{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Fictional work is saved.'}]}]);
const tool=()=>response([{type:'function_call',status:'completed',name:'create_task',arguments:'{}',call_id:'durable-task-call'}]);
function fixture(){
 const actor=demoActor(),conversation=createConversation(actor),requestId=key();
 getDb().prepare('INSERT INTO assistant_turns VALUES(?,?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,requestId,conversation.id,fingerprint({fixture:requestId}),'running',now(),null);
 const host={kind:'turn' as const,id:requestId};bindAssignment(actor,host);
 const scope=()=>({tasks:listTasks(actor).map(task=>task.id)});
 const dispatch=vi.fn(()=>{const task=createTask(actor,{title:'Checkpoint task',dueAt:null,investorId:null});return {message:'Task saved.',specialistIds:['daily-coordinator'],artifacts:[{type:'task',id:task.id,title:task.title}]} as ToolResult;});
 const input=()=>({actor,conversationId:conversation.id,requestId,message:'Save a fictional follow-up',instructions:'Use only the provided fictional task tool.',context:{fixture:true},scope:scope(),currentScope:scope,history:[],tools:[],dispatch,artifacts:[] as Artifact[],specialists:new Set<string>()});
 const run=()=>withAssignment(actor,host,()=>runLiveText(input()));
 const saved=()=>getDb().prepare('SELECT phase,version,scope_hash,data FROM text_executions WHERE request_id=?').get(requestId) as {phase:string;version:number;scope_hash:string;data:string};
 return {actor,host,requestId,conversation,input,run,saved,dispatch,scope};
}
beforeEach(()=>{closeDb();sequence=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');vi.stubEnv('OPENAI_REASONING_EFFORT','high');});
afterEach(()=>{closeDb();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});
describe('durable text rounds in the running host',()=>{
 it('reuses a completed original execution without another request, tool or debit',async()=>{const f=fixture(),fetcher=vi.fn().mockResolvedValueOnce(tool()).mockResolvedValueOnce(final());vi.stubGlobal('fetch',fetcher);const one=await f.run(),before=usageBalances(f.actor);expect(await f.run()).toEqual(one);expect(fetcher).toHaveBeenCalledTimes(2);expect(f.dispatch).toHaveBeenCalledTimes(1);expect(usageBalances(f.actor)).toEqual(before);expect(f.saved().phase).toBe('completed');expect(JSON.parse(f.saved().data).round).toBe(1);});
 it('rolls back effects with a failed next-round checkpoint and reuses the saved paid response after restart',async()=>{
  directory=mkdtempSync(join(tmpdir(),'agentdesk-text-state-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'state.sqlite'));const f=fixture(),fetcher=vi.fn().mockResolvedValueOnce(tool()).mockResolvedValueOnce(final());vi.stubGlobal('fetch',fetcher);
  const original=checkpoints.advanceTextExecution;let crash=true;const spy=vi.spyOn(checkpoints,'advanceTextExecution').mockImplementation((...args)=>{if(args[2]==='ready'&&crash){crash=false;throw new Error('simulated checkpoint crash');}return original(...args);});
  await expect(f.run()).rejects.toThrow('simulated checkpoint crash');expect(f.saved().phase).toBe('received');expect(listTasks(f.actor).some(task=>task.title==='Checkpoint task')).toBe(false);expect(getDb().prepare('SELECT count(*) n FROM assistant_tool_receipts').get()).toEqual({n:0});expect(providerOperations(f.actor)).toHaveLength(1);spy.mockRestore();closeDb();
  const answer=await f.run();expect(answer.message).toBe('Fictional work is saved.');expect(fetcher).toHaveBeenCalledTimes(2);expect(listTasks(f.actor).filter(task=>task.title==='Checkpoint task')).toHaveLength(1);expect(providerOperations(f.actor)).toHaveLength(2);
 });
 it('retains committed tools and the next round after an interruption between rounds',async()=>{
  const f=fixture(),fetcher=vi.fn().mockResolvedValueOnce(tool()).mockResolvedValueOnce(final());vi.stubGlobal('fetch',fetcher);
  const original=history.assertInboxToolResultVisible;let crashed=false;const spy=vi.spyOn(history,'assertInboxToolResultVisible').mockImplementation((...args)=>{if(!crashed&&f.saved()?.phase==='ready'&&JSON.parse(f.saved().data).round===1){crashed=true;throw new Error('between rounds');}return original(...args);});
  await expect(f.run()).rejects.toThrow('between rounds');expect(f.saved().phase).toBe('ready');expect(f.dispatch).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1);spy.mockRestore();await f.run();expect(f.dispatch).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2);
  const payload=JSON.parse(fetcher.mock.calls[1][1].body as string);expect(payload.input.some((item:{type?:string})=>item.type==='function_call_output')).toBe(true);
 });
 it('keeps uncertain calls unresolved and does not resend them after restart',async()=>{directory=mkdtempSync(join(tmpdir(),'agentdesk-text-unknown-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'state.sqlite'));const f=fixture(),fetcher=vi.fn().mockRejectedValue(new Error('connection lost'));vi.stubGlobal('fetch',fetcher);await expect(f.run()).rejects.toThrow('connection lost');expect(f.saved().phase).toBe('unknown');const held=usageBalances(f.actor);closeDb();await expect(f.run()).rejects.toThrow('unresolved outcome');expect(fetcher).toHaveBeenCalledTimes(1);expect(usageBalances(f.actor)).toEqual(held);expect(held.find(x=>x.category==='text_tokens')!.reserved).toBeGreaterThan(0);});
 it('blocks a simultaneous invocation while the original request is dispatched',async()=>{const f=fixture();let resolve!:(r:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);const running=f.run();expect(f.saved().phase).toBe('dispatching');await expect(f.run()).rejects.toThrow('unresolved outcome');resolve(final());await running;expect(fetcher).toHaveBeenCalledTimes(1);});
 it('withholds saved results after source changes without requesting another response',async()=>{const f=fixture(),fetcher=vi.fn().mockResolvedValue(final());vi.stubGlobal('fetch',fetcher);await f.run();createTask(f.actor,{title:'Changed fictional context',dueAt:null,investorId:null});await expect(f.run()).rejects.toThrow('withheld');expect(fetcher).toHaveBeenCalledTimes(1);});
 it('rejects changed original instructions or provider configuration',async()=>{const f=fixture(),fetcher=vi.fn().mockResolvedValue(final());vi.stubGlobal('fetch',fetcher);await f.run();await expect(withAssignment(f.actor,f.host,()=>runLiveText({...f.input(),instructions:'Different work'}))).rejects.toThrow('different instructions');vi.stubEnv('OPENAI_MODEL','different-model');await expect(f.run()).rejects.toThrow('different instructions');expect(fetcher).toHaveBeenCalledTimes(1);});
 it('cannot reopen another employee’s turn or rebind an execution',async()=>{const f=fixture(),fetcher=vi.fn().mockResolvedValue(final());vi.stubGlobal('fetch',fetcher);await f.run();expect(()=>withAssignment(demoActor('manager'),f.host,()=>f.run())).toThrow('not available');expect(()=>getDb().prepare('UPDATE text_executions SET binding_id=? WHERE request_id=?').run('invented',f.requestId)).toThrow('immutable');expect(withAssignment(f.actor,f.host,()=>currentAssignment(f.actor).rootId)).toBeTruthy();});
 it('saves confirmed failure without allowing its partial tools to run on retry',async()=>{const f=fixture(),fetcher=vi.fn().mockResolvedValue(response([{type:'function_call',status:'completed',name:'create_task',arguments:'{}',call_id:'partial'}],{status:'incomplete'}));vi.stubGlobal('fetch',fetcher);await expect(f.run()).rejects.toThrow('incomplete');expect(f.saved().phase).toBe('failed');await expect(f.run()).rejects.toThrow('confirmed failure');expect(f.dispatch).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);expect(usageBalances(f.actor).find(x=>x.category==='text_tokens')!.consumed).toBe(140);});
 it('keeps output and accounting together when receipt storage rolls back',async()=>{const f=fixture(),fetcher=vi.fn().mockResolvedValue(final());vi.stubGlobal('fetch',fetcher);const original=checkpoints.advanceTextExecution;vi.spyOn(checkpoints,'advanceTextExecution').mockImplementation((...args)=>{if(args[2]==='received')throw new Error('receipt checkpoint failed');return original(...args);});await expect(f.run()).rejects.toThrow('receipt checkpoint failed');expect(f.saved().phase).toBe('unknown');expect(providerOperations(f.actor)[0]).toMatchObject({status:'unknown',usage:{}});expect(usageBalances(f.actor).find(x=>x.category==='text_tokens')!.consumed).toBe(0);await expect(f.run()).rejects.toThrow('unresolved');expect(fetcher).toHaveBeenCalledTimes(1);});
});
