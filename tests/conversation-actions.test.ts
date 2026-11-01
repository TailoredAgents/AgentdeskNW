import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor, Task } from '../src/lib/contracts';
import { closeDb, demoActor, getDb, now } from '../src/server/db';
import { addMessage, createConversation, createTask, getInvestor } from '../src/server/services';
import { getInboxState } from '../src/server/communications';
import { grantLegacyTestWorkforce } from './fixtures';
import { getPersonalTask, mutateTask } from '../src/server/task-actions';
import { readConversationFocus, setConversationFocus } from '../src/server/conversation-focus';
import { executeConversationAction, parseTaskDate, prepareConversationAction, taskActionIntent } from '../src/server/conversation-actions';
import { getInvestorJourney, recordJourneyObservation } from '../src/server/journey';
import { chat, dispatchTool } from '../src/server/orchestrator';

let actor:Actor,conversationId:string,sequence:number;
beforeEach(()=>{
  closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T15:00:00.000Z'));
  actor=demoActor();grantLegacyTestWorkforce();conversationId=createConversation(actor).id;sequence=0;
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider request');}));
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const task=(title='Call Mike about repair scope',dueAt:string|null='2026-10-29T19:00:00.000Z')=>createTask(actor,{title,dueAt,investorId:'investor-mike'});
const ask=(message:string)=>executeConversationAction(actor,message,conversationId,`action-${++sequence}`);
function focus(value:Task,turnKey='focus-turn'){
  setConversationFocus(actor,conversationId,{kind:'task',id:value.id,version:value.version??0,source:'assistant_result',eventKey:`focus-${++sequence}`,turnKey});
  addMessage(actor,conversationId,{role:'assistant',content:`Saved reminder: ${value.title}.`,artifacts:[{type:'task',id:value.id,title:value.title}]});
}
const advance=()=>vi.setSystemTime(new Date(Date.now()+1));

describe('conversational task lifecycle',()=>{
  it('recognizes supported commands without treating a quote or hypothetical as an instruction',()=>{
    expect(taskActionIntent('Snooze it for two hours.')).toMatchObject({action:'snooze',target:'it',minutes:120});
    expect(taskActionIntent('snooze for an hour')).toMatchObject({action:'snooze',target:'',minutes:60});
    expect(taskActionIntent('Please mark that reminder as done')).toMatchObject({action:'complete'});
    expect(taskActionIntent('Can you mark that reminder as done?')).toMatchObject({action:'complete'});
    expect(taskActionIntent('Could you please move it to tomorrow?')).toMatchObject({action:'reschedule',dateText:'tomorrow'});
    expect(taskActionIntent('I finished the task Repair callback.')).toMatchObject({action:'complete',target:'the task Repair callback'});
    expect(taskActionIntent('I’m done')).toMatchObject({action:'complete'});
    for(const message of ['Mike said "complete my task"','"Done"','If I finish, complete it','Do not cancel the reminder','Imagine moving it to tomorrow','Here is a transcript:\nDone'])expect(taskActionIntent(message)).toBeNull();
  });

  it('requires an explicit choice for bare done with no focus, even if there is only one task',()=>{
    getDb().prepare("UPDATE tasks SET data=json_set(data,'$.status','completed') WHERE owner_id=?").run(actor.id);
    const value=task();const result=ask('done')!;
    expect(result.message).toContain('Which task');expect(getPersonalTask(actor,value.id).status).toBe('open');
    advance();expect(ask('1')!.message).toContain('marked complete');expect(getPersonalTask(actor,value.id).status).toBe('completed');
  });

  it('completes a named task and retains its history without changing investor facts',()=>{
    const value=task(),investor=getInvestor(actor,'investor-mike');
    expect(ask('Complete the reminder to call Mike about repair scope')!.message).toContain('marked complete');
    expect(getPersonalTask(actor,value.id)).toMatchObject({status:'completed',version:2});expect(getInvestor(actor,'investor-mike')).toEqual(investor);
    expect(getInvestorJourney(actor,'investor-mike').completedTasks.map(item=>item.id)).toContain(value.id);
  });

  it('uses the exact current focused task for short requests',()=>{
    const selected=task('Callback about repair scope'),other=task('Check a different concern');focus(selected);advance();
    const result=ask('done')!;
    expect(result.artifacts[0].id).toBe(selected.id);expect(getPersonalTask(actor,selected.id).status).toBe('completed');expect(getPersonalTask(actor,other.id).status).toBe('open');
  });

  it('asks numbered clarification for multiple matching tasks and executes only the chosen task',()=>{
    const first=task('Call Mike about repairs'),second=task('Call Mike about financing');
    expect(ask('cancel the reminder to call Mike')!.message).toContain('More than one');
    const pending=readConversationFocus(actor,conversationId);expect(pending.pending?.action).toBe('cancel');
    const chosen=pending.candidates[1].id;advance();expect(ask('2')!.message).toContain('Canceled');
    for(const value of [first,second])expect(getPersonalTask(actor,value.id).status).toBe(value.id===chosen?'canceled':'open');
  });

  it('does not guess when one assistant turn or reminder context identifies several tasks',()=>{
    const first=task('Call Mike about repairs'),second=task('Call Mike about financing');focus(first,'same-turn');focus(second,'same-turn');advance();
    expect(ask('done')!.message).toContain('Which task');
    expect(getPersonalTask(actor,first.id).status).toBe('open');expect(getPersonalTask(actor,second.id).status).toBe('open');
  });

  it('does not reuse a stale version when a task changes after it was mentioned',()=>{
    const value=task();focus(value);advance();mutateTask(actor,value.id,{action:'reschedule',dueAt:'2026-11-01T15:00:00Z',expectedVersion:value.version});advance();
    expect(ask('done')!.message).toContain('earlier task reference has changed');expect(getPersonalTask(actor,value.id).status).toBe('open');
  });

  it('moves tomorrow at the original Eastern time and reports the actual deadline',()=>{
    const value=task();focus(value);advance();const result=ask('move it to tomorrow')!;
    expect(result.message).toContain('3:00 PM');expect(result.message).toContain('Eastern');expect(getPersonalTask(actor,value.id).dueAt).toBe('2026-10-30T19:00:00.000Z');
  });

  it('understands narrow time corrections without treating style edits or quotations as task commands',()=>{
    expect(taskActionIntent('Actually, make that 2 p.m.')).toMatchObject({action:'reschedule',target:'that',dateText:'same date at 2 p.m'});
    expect(taskActionIntent('Make it tomorrow at 2 pm')).toMatchObject({action:'reschedule',target:'it',dateText:'tomorrow at 2 pm'});
    for(const text of ['Make it shorter','Make it 2 sentences','Make it 20% shorter','Actually, make that casual','Mike said make that 2pm','"Make it tomorrow at 2pm"','If possible make it 2pm','Do not make it 2pm'])expect(taskActionIntent(text)).toBeNull();
  });

  it('corrects the clock on the focused task’s existing day and replays once through Copilot',async()=>{
    const selected=task('Repair breakdown check','2026-10-30T14:00:00Z'),other=task('Other check');focus(selected);advance();
    const changed=await chat(actor,'Actually, make that 2 p.m.',conversationId,'clock-correction');
    expect(changed.result.message).toContain('2:00 PM');expect(getPersonalTask(actor,selected.id)).toMatchObject({dueAt:'2026-10-30T18:00:00.000Z',version:2});
    expect(getPersonalTask(actor,other.id).version).toBe(1);advance();
    expect((await chat(actor,'Actually, make that 2 p.m.',conversationId,'clock-correction')).result).toEqual(changed.result);
    expect(getPersonalTask(actor,selected.id).version).toBe(2);
  });

  it('prioritizes the one actually saved task in the latest completed turn over preceding duplicate-check results',async()=>{
    const other=task('Existing callback','2026-10-30T13:00:00Z'),requestId='list-then-save',command={conversationId,requestId,message:'Remind me tomorrow at 10am to check the repair breakdown.'};
    const list=await dispatchTool(actor,'list_my_tasks',{status:'open',query:null},command);
    const saved=await dispatchTool(actor,'create_task',{title:'Repair breakdown check',dueAt:'2026-10-30T14:00:00Z',investorId:'investor-mike'},command);
    const answer=addMessage(actor,conversationId,{role:'assistant',content:'Saved the repair breakdown reminder for tomorrow at 10am.',artifacts:[...list.artifacts,...saved.artifacts]});
    getDb().prepare('INSERT INTO assistant_turns VALUES(?,?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,requestId,conversationId,'fixture-request','completed',now(),JSON.stringify({messageId:answer.id}));
    const id=saved.artifacts[0].id!;expect(readConversationFocus(actor,conversationId).status).toBe('ambiguous');advance();
    const changed=await chat(actor,'Actually, make that 2 p.m.',conversationId,'correct-created-task');
    expect(changed.result.message).toContain('2:00 PM');expect(getPersonalTask(actor,id)).toMatchObject({dueAt:'2026-10-30T18:00:00.000Z',version:2});expect(getPersonalTask(actor,other.id).version).toBe(1);
    advance();await chat(actor,'Actually, make that 2 p.m.',conversationId,'correct-created-task');expect(getPersonalTask(actor,id).version).toBe(2);
  });

  it('does not arbitrarily prioritize one of two tasks actually created in the same turn',async()=>{
    const requestId='save-two-tasks',command={conversationId,requestId,message:'Create two reminders for these checks.'};
    const one=await dispatchTool(actor,'create_task',{title:'First check',dueAt:'2026-10-30T14:00:00Z',investorId:null},command);
    const two=await dispatchTool(actor,'create_task',{title:'Second check',dueAt:'2026-10-31T14:00:00Z',investorId:null},command);
    const answer=addMessage(actor,conversationId,{role:'assistant',content:'Saved both reminders.',artifacts:[...one.artifacts,...two.artifacts]});
    getDb().prepare('INSERT INTO assistant_turns VALUES(?,?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,requestId,conversationId,'fixture-request','completed',now(),JSON.stringify({messageId:answer.id}));advance();
    expect(ask('Actually, make it 2pm')!.message).toContain('Which reminder');
    expect(getPersonalTask(actor,one.artifacts[0].id!).version).toBe(1);expect(getPersonalTask(actor,two.artifacts[0].id!).version).toBe(1);
  });

  it('keeps a time-only correction through an explicit choice without guessing between tasks',()=>{
    const first=task('Repair callback','2026-10-30T14:00:00Z'),second=task('Lender callback','2026-10-31T14:00:00Z');
    focus(first,'same-turn');focus(second,'same-turn');
    addMessage(actor,conversationId,{role:'assistant',content:'Here are the two reminders.',artifacts:[first,second].map(value=>({type:'task',id:value.id,title:value.title}))});advance();
    expect(ask('Actually, make that 2 p.m.')!.message).toContain('Which reminder');
    expect(getPersonalTask(actor,first.id).version).toBe(1);expect(getPersonalTask(actor,second.id).version).toBe(1);
    const choice=readConversationFocus(actor,conversationId).candidates.findIndex(item=>item.id===second.id)+1;advance();
    expect(ask(String(choice))!.message).toContain('2:00 PM');
    expect(getPersonalTask(actor,first.id).version).toBe(1);expect(getPersonalTask(actor,second.id)).toMatchObject({dueAt:'2026-10-31T18:00:00.000Z',version:2});
  });

  it('requires a current received reference and does not reuse a changed task for a correction',()=>{
    const value=task('Private callback');
    setConversationFocus(actor,conversationId,{kind:'task',id:value.id,version:value.version??0,source:'assistant_result',eventKey:'not-delivered',turnKey:'unseen',deliveryRequestId:'no-accepted-reply'});advance();
    expect(ask('Make it tomorrow at 2pm')!.message).toContain('Which reminder');expect(getPersonalTask(actor,value.id).version).toBe(1);
    focus(value);advance();mutateTask(actor,value.id,{action:'reschedule',dueAt:'2026-11-02T15:00:00Z',expectedVersion:value.version});advance();
    expect(ask('Actually, make that 2 p.m.')!.message).toContain('earlier task reference has changed');expect(getPersonalTask(actor,value.id)).toMatchObject({dueAt:'2026-11-02T15:00:00.000Z',version:2});
  });

  it('asks for an unscheduled date and respects an explicit corrected date',()=>{
    const value=task('Unscheduled check',null);focus(value);advance();
    expect(ask('Actually, make that 2 p.m.')!.message).toContain('no scheduled date');expect(getPersonalTask(actor,value.id).version).toBe(1);advance();
    expect(ask('Make it tomorrow at 2 pm')!.message).toContain('2:00 PM');expect(getPersonalTask(actor,value.id)).toMatchObject({dueAt:'2026-10-30T18:00:00.000Z',version:2});
  });

  it('clarifies an ambiguous correction clock and retains the task’s scheduled day',()=>{
    const value=task('Tomorrow callback','2026-10-30T14:00:00Z');focus(value);advance();
    expect(ask('Actually, make it 2')!.message).toContain('am/pm');expect(getPersonalTask(actor,value.id).version).toBe(1);advance();
    expect(ask('2pm')!.message).toContain('2:00 PM');expect(getPersonalTask(actor,value.id)).toMatchObject({dueAt:'2026-10-30T18:00:00.000Z',version:2});
  });

  it('does not apply a generic correction to an old reminder after inspecting an Inbox thread',async()=>{
    const value=task('Old reminder','2026-10-30T14:00:00Z');focus(value);advance();
    const thread=getInboxState(actor).threads[0];await chat(actor,`Read ${thread.id}`,conversationId,'new-inbox-topic');advance();
    const result=await chat(actor,'Actually, make it 2 p.m.',conversationId,'correction-after-email');
    expect(result.result.message).toContain('Which reminder should I change');expect(getPersonalTask(actor,value.id)).toMatchObject({dueAt:'2026-10-30T14:00:00.000Z',version:1});
  });

  it.each(['property','plain'])('does not reuse old task focus after a newer %s topic',kind=>{
    const value=task('Old callback','2026-10-30T14:00:00Z');focus(value);advance();
    addMessage(actor,conversationId,{role:'user',content:kind==='property'?'Tell me about 123 Example Street.':'How should I introduce myself to the new wholesaler?'});
    addMessage(actor,conversationId,{role:'assistant',content:'Here is the current topic.',artifacts:kind==='property'?[{type:'release',id:'release-maple',title:'123 Example Street'}]:[]});advance();
    expect(ask('Actually, make that 2 p.m.')!.message).toContain('Which reminder should I change');expect(getPersonalTask(actor,value.id).version).toBe(1);
  });

  it('retains the same task through a narrow time-status follow-up without using model prose as authority',()=>{
    const value=task('Tomorrow callback','2026-10-30T14:00:00Z');focus(value);advance();
    addMessage(actor,conversationId,{role:'user',content:'What time did you set?'});
    addMessage(actor,conversationId,{role:'assistant',content:'It is set for 10 a.m. tomorrow.'});advance();
    expect(ask('Actually, make that 2 p.m.')!.message).toContain('2:00 PM');expect(getPersonalTask(actor,value.id)).toMatchObject({dueAt:'2026-10-30T18:00:00.000Z',version:2});
  });

  it('requires explicit selection after a topic change and applies only that selected reminder',async()=>{
    const first=task('Old callback','2026-10-30T14:00:00Z'),second=task('Other callback','2026-10-31T14:00:00Z');focus(first);advance();
    addMessage(actor,conversationId,{role:'user',content:'Tell me about your role.'});addMessage(actor,conversationId,{role:'assistant',content:'I help with the work you choose.'});advance();
    const asked=await chat(actor,'Make it 2pm',conversationId,'choose-current-reminder');expect(asked.result.message).toContain('Which reminder should I change');
    const choice=readConversationFocus(actor,conversationId).candidates.findIndex(item=>item.id===second.id)+1;advance();
    await chat(actor,String(choice),conversationId,'choose-other-reminder');expect(getPersonalTask(actor,first.id).version).toBe(1);expect(getPersonalTask(actor,second.id)).toMatchObject({dueAt:'2026-10-31T18:00:00.000Z',version:2});
  });

  it('asks for a time on an unscheduled task and accepts a short time reply',()=>{
    const value=task('Unscheduled follow-up',null);focus(value);advance();expect(ask('move it to tomorrow')!.message).toContain('What time tomorrow');
    expect(getPersonalTask(actor,value.id).dueAt).toBeNull();advance();expect(ask('9am')!.message).toContain('9:00 AM');expect(getPersonalTask(actor,value.id).dueAt).toBe('2026-10-30T13:00:00.000Z');
  });

  it.each(['tomorrow 9','tomorrow at 9','Friday 9','2026-10-30 9'])('replaces the ambiguous clock in %s when the employee clarifies it',date=>{
    const value=task('Unscheduled follow-up',null);focus(value);advance();
    expect(ask(`move it to ${date}`)!.message).toContain('am/pm');
    expect(getPersonalTask(actor,value.id).dueAt).toBeNull();advance();
    expect(ask('9am')!.message).toContain('9:00 AM');
    expect(getPersonalTask(actor,value.id)).toMatchObject({dueAt:'2026-10-30T13:00:00.000Z',version:2});
  });

  it('keeps tomorrow anchored to the original request when a time clarification crosses midnight',()=>{
    vi.setSystemTime(new Date('2026-10-30T03:55:00Z'));
    const value=task('Midnight follow-up',null);focus(value);advance();expect(ask('move it to tomorrow')!.message).toContain('What time tomorrow');
    vi.setSystemTime(new Date('2026-10-30T04:05:00Z'));
    expect(ask('9am')!.message).toContain('9:00 AM');expect(getPersonalTask(actor,value.id).dueAt).toBe('2026-10-30T13:00:00.000Z');
  });

  it('snoozes and cancels through named commands without deleting the task',()=>{
    const value=task('Repair callback');expect(ask('snooze Repair callback for two hours')!.message).toContain('Snoozed');
    expect(getPersonalTask(actor,value.id).dueAt).toBe('2026-10-29T17:00:00.000Z');advance();
    expect(ask('cancel the reminder to Repair callback')!.message).toContain('Canceled');expect(getPersonalTask(actor,value.id)).toMatchObject({status:'canceled',version:3});
  });

  it('handles invalid dates and bulk commands with clarification instead of model fallback',()=>{
    const value=task();focus(value);advance();
    for(const message of ['move it to sometime later','move it to yesterday at 9am','snooze it for 999999 hours','complete all tasks']){
      const prepared=prepareConversationAction(actor,message,conversationId,{requestId:`bad-${++sequence}`});expect(prepared?.kind).toBe('clarification');
    }
    expect(getPersonalTask(actor,value.id)).toMatchObject({status:'open',version:1});
  });

  it('keeps ambiguous requests reusable after other task records change',()=>{
    task('Call Mike about repairs');task('Call Mike about financing');expect(ask('cancel the reminder to call Mike')!.message).toContain('More than one');
    task('Call Mike about timing');advance();expect(ask('cancel the reminder to call Mike')!.message).toContain('More than one');
  });

  it('rejects another employee conversation and does not show their private task titles',()=>{
    const manager=demoActor('manager'),managerThread=createConversation(manager).id,privateTask=createTask(manager,{title:'Private managerial task'});
    expect(()=>executeConversationAction(actor,'done',managerThread,'foreign')).toThrow('not found');
    expect(ask(`complete ${privateTask.title}`)!.message).not.toContain(privateTask.title);expect(getPersonalTask(manager,privateTask.id).status).toBe('open');
  });

  it('preserves numbered clarification through real Copilot turns and replays without another mutation',async()=>{
    task('Call Mike about repairs');task('Call Mike about financing');
    const first=await chat(actor,'cancel the reminder to call Mike',conversationId,'conversation-choose');
    expect(first.result.message).toContain('More than one');const pending=readConversationFocus(actor,conversationId);expect(pending.pending?.action).toBe('cancel');
    const chosen=pending.candidates[1].id;advance();const result=await chat(actor,'2',conversationId,'conversation-answer');expect(result.result.message).toContain('Canceled');
    const version=getPersonalTask(actor,chosen).version;await chat(actor,'2',conversationId,'conversation-answer');expect(getPersonalTask(actor,chosen).version).toBe(version);
  });

  it('uses updated focus after rescheduling in Copilot and rejects a model-selected unauthorized action',async()=>{
    const value=task('Repair callback'),other=task('Other callback');
    const first=await chat(actor,'move Repair callback to tomorrow at 9am',conversationId,'chat-reschedule');expect(first.result.message).toContain('Moved');advance();
    const done=await chat(actor,'done',conversationId,'chat-done');expect(done.result.message).toContain('marked complete');expect(getPersonalTask(actor,value.id).status).toBe('completed');
    await expect(dispatchTool(actor,'manage_task',{taskId:other.id,action:'cancel'},{conversationId,requestId:'forged-model-action',message:'What is my schedule?'})).rejects.toThrow('explicit request');
    expect(getPersonalTask(actor,other.id).status).toBe('open');
  });
});

describe('Eastern scheduling',()=>{
  it('preserves the existing scheduled day and applies its correct offset for a clock correction',()=>{
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));const value=task('After clocks change','2026-11-02T15:00:00Z');
    expect(parseTaskDate('same date at 2 p.m.',value).dueAt).toBe('2026-11-02T19:00:00.000Z');
    expect(parseTaskDate('tomorrow at 9 a.m.',value).dueAt).toBe('2026-11-01T14:00:00.000Z');
  });
  it('preserves local wall time across spring-forward and fall-back',()=>{
    vi.setSystemTime(new Date('2027-03-13T13:00:00Z'));const spring=task('Spring task','2027-03-13T14:00:00Z');
    expect(parseTaskDate('tomorrow',spring).dueAt).toBe('2027-03-14T13:00:00.000Z');
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));const fall=task('Fall task','2026-10-31T13:00:00Z');
    expect(parseTaskDate('tomorrow',fall).dueAt).toBe('2026-11-01T14:00:00.000Z');
  });
  it('asks for clarification on nonexistent and duplicated clock-change times',()=>{
    vi.setSystemTime(new Date('2027-03-13T13:00:00Z'));const value=task('Clock-change task','2027-03-13T14:00:00Z');
    expect(parseTaskDate('tomorrow at 2:30am',value).error).toContain('does not exist');
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    expect(parseTaskDate('tomorrow at 1:30am',value).error).toContain('occurs twice');
    expect(parseTaskDate('2026-11-01T01:30:00-05:00',value).dueAt).toBe('2026-11-01T06:30:00.000Z');
  });
  it('accepts weekday/exact dates and rejects impossible dates or ambiguous clocks',()=>{
    const value=task();expect(parseTaskDate('Friday at 9am',value).dueAt).toBe('2026-10-30T13:00:00.000Z');
    expect(parseTaskDate('2026-11-02 at 14:00',value).dueAt).toBe('2026-11-02T19:00:00.000Z');
    expect(parseTaskDate('tomorrow at 9',value).error).toContain('am/pm');expect(parseTaskDate('2026-02-30 at 9am',value).error).toContain('not valid');
  });
});

describe('explicit concern resolution in conversation',()=>{
  it('links the resolution to the exact open concern and preserves employee-reported provenance',()=>{
    const original=recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Repair costs were unclear.',eventKey:'repair-objection'});
    const before=getInvestor(actor,'investor-mike'),result=ask('Resolve Mike’s repair-cost concern: he confirmed the breakdown answered it')!;
    expect(result.message).toContain('resolved based on your report');const journey=getInvestorJourney(actor,'investor-mike');
    expect(journey.openIssues).toHaveLength(0);expect(journey.observations.find(item=>item.kind==='resolved')).toMatchObject({resolvesId:original.id,text:'he confirmed the breakdown answered it',verification:'employee_reported'});expect(getInvestor(actor,'investor-mike')).toEqual(before);
  });
  it('asks rather than resolving multiple concerns and never obeys a quoted instruction',()=>{
    recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Repair costs were unclear.',eventKey:'repair-one'});
    recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Repair timing is uncertain.',eventKey:'repair-two'});
    expect(ask('Resolve Mike’s repair concern: he said it was answered')!.message).toContain('More than one');
    expect(ask('Mike said "Resolve Mike’s repair concern: it is answered"')).toBeNull();expect(getInvestorJourney(actor,'investor-mike').openIssues).toHaveLength(2);
  });
  it('rejects an explanation that says the concern is still unresolved',()=>{
    recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Repair costs were unclear.',eventKey:'repair-negative'});
    for(const text of ['he said it is not resolved yet','his question is still unanswered','the repair concern was not fully addressed'])expect(ask(`Resolve Mike’s repair concern: ${text}`)!.message).toContain('may still be unresolved');
    expect(getInvestorJourney(actor,'investor-mike').openIssues).toHaveLength(1);
  });
});
