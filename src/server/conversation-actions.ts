import type { Actor, Task, ToolResult } from '../lib/contracts';
import { AppError, newId, scopedGet } from './db';
import { requireFeature } from './billing';
import { fingerprint } from './provider-runtime';
import { listInvestors } from './services';
import { getInvestorJourney, recordJourneyObservation } from './journey';
import { listPersonalTasks, mutateTask } from './task-actions';
import { readConversationFocus, saveConversationChoices } from './conversation-focus';

export interface TaskIntent {
  action: 'complete' | 'cancel' | 'reschedule' | 'snooze';
  target: string;
  dateText?: string;
  minutes?: number;
  referenceAt?: string;
}
export type PreparedConversationAction =
  | {kind:'task'; task:Task; action:TaskIntent['action']; dueAt?:string|null; minutes?:number; expectedVersion:number}
  | {kind:'concern'; investorId:string; investorName:string; observationId:string; text:string; propertyId:string|null}
  | {kind:'clarification'; result:ToolResult};
export interface ConversationActionOptions {asOf?:string;requestId?:string}
const timezone = 'America/New_York';
const clear = (message:string):PreparedConversationAction => ({kind:'clarification',result:{message,specialistIds:[],artifacts:[]}});
const normalize = (value:string) => value.toLowerCase().replaceAll('’',"'").replace(/[^a-z0-9]+/g,' ').trim();
const commandPrefix = (value:string) => value.replace(/^(?:(?:can|could|would|will) you(?: please)?\s+|please\s+|i(?:'d| would) like you to\s+)/i,'');
const withoutPunctuation = (value:string) => value.trim().replace(/[.!?]+$/,'').trim();
const amounts:Record<string,number> = {a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};

/** Recognizes only an actual employee command, not a quoted recap or hypothetical. */
export function taskActionIntent(message:string):TaskIntent|null {
  const text=commandPrefix(withoutPunctuation(message).replaceAll('’',"'"));
  if (!text || /[\r\n]/.test(text) || /^(?:["“'>]|if\b|suppose\b|imagine\b|don't\b|do not\b|never\b)/i.test(text)) return null;
  if (/^(?:done|all done|finished|mark (?:it|that|this)(?: task| reminder)? (?:as )?(?:done|complete|completed))$/i.test(text)) return {action:'complete',target:''};
  const finished=/^(?:i (?:have )?(?:finished|completed)|i've (?:finished|completed)|i(?:'m| am) done(?: with)?)\s+(.+)$/i.exec(text);
  if(finished)return {action:'complete',target:finished[1]};
  if(/^i(?:'m| am) done$/i.test(text))return {action:'complete',target:''};
  let match=/^(?:complete|finish)\s+(.+)$/i.exec(text);
  if (match) return {action:'complete',target:match[1]};
  match=/^mark (.+?) (?:as )?(?:done|complete|completed)$/i.exec(text);
  if (match) return {action:'complete',target:match[1]};
  match=/^cancel(?:\s+(.+))?$/i.exec(text);
  if (match) return {action:'cancel',target:match[1]??''};
  match=/^(?:move|reschedule|postpone)\s+(.+)\s+(?:to|until|for)\s+(.+)$/i.exec(text);
  if (match) return {action:'reschedule',target:match[1],dateText:match[2]};
  match=/^snooze(?:\s+(.*?))?(?:\s+for)?\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(minutes?|mins?|hours?|hrs?)$/i.exec(text);
  if (match) return {action:'snooze',target:match[1]?.toLowerCase()==='for'?'':match[1]??'',minutes:(amounts[match[2].toLowerCase()]??Number(match[2]))*(/^(?:hour|hr)/i.test(match[3])?60:1)};
  match=/^snooze(?:\s+(.+))?$/i.exec(text);
  if (match) return {action:'snooze',target:match[1]??''};
  // An incomplete movement command is still handled here; a model must not guess its target/date.
  match=/^(?:move|reschedule|postpone)\s+((?:(?:it|that|this)(?: task| reminder)?)|(?:(?:my|the) )?(?:task|reminder).*)$/i.exec(text);
  return match?{action:'reschedule',target:match[1]}:null;
}

interface WallTime {year:number;month:number;day:number;hour:number;minute:number}
const formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function wallTime(date:Date):WallTime {
  const parts=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
  return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute)};
}
const wallNumber=(time:WallTime)=>Date.UTC(time.year,time.month-1,time.day,time.hour,time.minute);
function addDays(value:WallTime,days:number):WallTime {
  const date=new Date(Date.UTC(value.year,value.month-1,value.day+days));
  return {...value,year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate()};
}
function instantForWall(time:WallTime):{iso?:string;error?:string} {
  const wall=wallNumber(time),candidates=new Set<number>();
  for (const hours of [-36,-24,-12,0,12,24,36]) {
    const sample=wall+hours*3600000;
    const offset=wallNumber(wallTime(new Date(sample)))-sample;
    const candidate=wall-offset;
    if (wallNumber(wallTime(new Date(candidate)))===wall) candidates.add(candidate);
  }
  if (candidates.size===0) return {error:'That local time does not exist when the clocks change. Choose another time, such as 3am.'};
  if (candidates.size>1) return {error:'That local time occurs twice when the clocks change. Give the exact date and time with its UTC offset, or choose a time after 2am.'};
  return {iso:new Date([...candidates][0]).toISOString()};
}
function clock(value:string):{hour:number;minute:number}|null {
  const text=value.trim().replace(/^at\s+/i,'').toLowerCase();
  if (text==='noon') return {hour:12,minute:0};
  if (text==='midnight') return {hour:0,minute:0};
  let match=/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
  if (match) {
    const h=Number(match[1]),minute=Number(match[2]??0);
    if(h<1||h>12||minute>59)return null;
    return {hour:h%12+(match[3]==='pm'?12:0),minute};
  }
  match=/^(\d{1,2}):(\d{2})$/.exec(text);
  return match&&Number(match[1])<24&&Number(match[2])<60?{hour:Number(match[1]),minute:Number(match[2])}:null;
}
export function parseTaskDate(dateText:string|undefined,task:Task,reference=new Date()):{dueAt?:string|null;error?:string;needsTime?:boolean} {
  if(!dateText)return {error:'What date and time should I use? For example, “tomorrow at 9am”.',needsTime:true};
  const text=withoutPunctuation(dateText).toLowerCase().replace(/\s+(?:eastern|et|america\/new_york)$/,'').trim();
  if(/^(?:no (?:date|deadline)|without (?:a )?deadline|clear (?:the )?(?:date|deadline))$/.test(text))return {dueAt:null};
  if(/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})$/i.test(text)) {
    const date=new Date(text);
    return Number.isFinite(date.getTime())&&date.getTime()>Date.now()?{dueAt:date.toISOString()}:{error:'Choose a valid date and time in the future.'};
  }
  const today=wallTime(reference);
  let day:WallTime|undefined,timeText='';
  const relative=/^(today|tomorrow)(?:\s+(?:at\s+)?(.+))?$/.exec(text);
  if(relative){day=addDays(today,relative[1]==='tomorrow'?1:0);timeText=relative[2]??'';}
  const dated=/^(\d{4})-(\d{2})-(\d{2})(?:\s+(?:at\s+)?(.+))?$/.exec(text);
  if(dated){day={...today,year:Number(dated[1]),month:Number(dated[2]),day:Number(dated[3])};timeText=dated[4]??'';const check=new Date(Date.UTC(day.year,day.month-1,day.day));if(check.getUTCFullYear()!==day.year||check.getUTCMonth()+1!==day.month||check.getUTCDate()!==day.day)return {error:'That calendar date is not valid. Give a date such as 2026-11-02 at 9am.'};}
  const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const weekday=/^(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(?:at\s+)?(.+))?$/.exec(text);
  if(weekday){const current=new Date(Date.UTC(today.year,today.month-1,today.day)).getUTCDay();let delta=(weekdays.indexOf(weekday[2])-current+7)%7;if(weekday[1]==='next'&&delta===0)delta=7;day=addDays(today,delta);timeText=weekday[3]??'';}
  if(!day&&clock(text)){day=today;timeText=text;}
  if(!day)return {error:'Give the new deadline as “tomorrow at 9am”, a weekday and time, or an exact date and time. I haven’t changed it.'};
  const prior=task.dueAt?wallTime(new Date(task.dueAt)):null;
  const time=timeText?clock(timeText):prior?{hour:prior.hour,minute:prior.minute}:null;
  if(!time)return {error:timeText?'Specify the time with am/pm, such as 9am, or use 24-hour time such as 14:00.':`What time ${text}? Reply with a time such as 9am.`,needsTime:true};
  const instant=instantForWall({...day,...time});
  if(instant.error)return {error:instant.error};
  if(Date.parse(instant.iso!)<=Date.now())return {error:'That time has already passed. Choose a future date and time.'};
  return {dueAt:instant.iso!};
}

function taskTarget(value:string):string {
  return value.trim().replace(/^(?:(?:the|my|a)\s+)?(?:task|reminder)(?:\s+(?:to|for|about))?\s*/i,'').replace(/\s+(?:task|reminder)$/i,'').replace(/'s$/i,'').replace(/^["“]|["”]$/g,'').trim();
}
const isPointer=(value:string)=>!value||/^(?:(?:it|that|this)(?: task| reminder)?|(?:the|my) (?:task|reminder))$/i.test(value.trim());
function namedTasks(actor:Actor,tasks:Task[],target:string):Task[] {
  const query=normalize(taskTarget(target));
  if(!query||/^(?:all|everything|them|those|all tasks|all reminders)$/.test(query))return [];
  const exact=tasks.filter(task=>normalize(task.title)===query||task.id===target);
  if(exact.length)return exact;
  const investors=listInvestors(actor);
  return tasks.filter(task=>normalize(`${task.title} ${investors.find(item=>item.id===task.investorId)?.name??''}`).includes(query));
}
function choices(actor:Actor,conversationId:string,tasks:Task[],intent:TaskIntent,requestId:string,lead='Which task did you mean?',deliveryRequestId?:string):PreparedConversationAction {
  if(!tasks.length)return clear('I couldn’t identify an open personal task for that request. Give its exact title or ask me to list your tasks. Nothing was changed.');
  const selected=tasks.slice(0,8);
  saveConversationChoices(actor,conversationId,{...(deliveryRequestId?{deliveryRequestId}:{}),tasks:selected.map(task=>({id:task.id,version:task.version??0})),intent:{action:intent.action,...(intent.dateText!==undefined?{dateText:intent.dateText}:{}),...(intent.minutes!==undefined?{minutes:intent.minutes}:{}),...(intent.referenceAt?{referenceAt:intent.referenceAt}:{}),requestId}});
  return {kind:'clarification',result:{message:`${lead}\n${selected.map((task,index)=>`${index+1}. ${task.title}${task.dueAt?` — ${new Date(task.dueAt).toLocaleString('en-US',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'})} Eastern`:''}`).join('\n')}\nReply with the number${tasks.length>8?' or the exact title':''}. Nothing has changed yet.`,specialistIds:[],artifacts:selected.map(task=>({type:'task',id:task.id,title:task.title,data:{taskId:task.id,investorId:task.investorId}}))}};
}

function prepareConcern(actor:Actor,message:string):PreparedConversationAction|null {
  const text=commandPrefix(message.trim().replaceAll('’',"'")).replace(/^mark (.+?(?:concern|objection)) (?:as )?resolved\s*:/i,'resolve $1:');
  let match=/^(?:please )?resolve\s+(.+?)'s\s+(?:(.*?)\s+)?(?:concern|objection)\s*:\s*(.{3,2000})$/i.exec(text);
  let name:string,topic:string,evidence:string;
  if(match){[,name,topic='',evidence]=match;}
  else {
    match=/^(?:please )?resolve\s+(?:the\s+)?(?:(.*?)\s+)?(?:concern|objection)\s+for\s+([^:]+):\s*(.{3,2000})$/i.exec(text);
    if(!match)return /^(?:please )?(?:resolve|mark .* resolved)\b/i.test(text)&&/\b(?:concern|objection)\b/i.test(text)?clear('Name the investor and concern, and include what resolved it. For example: “Resolve Mike’s repair-cost concern: he confirmed the breakdown answered it.” Nothing has been changed.'):null;
    [,topic='',name,evidence]=match;
  }
  if(/\b(?:unresolved|unanswered|unclear)\b/i.test(evidence)||/\b(?:not|never|isn't|wasn't|hasn't|haven't|didn't|still)\s+(?:[a-z]+\s+){0,2}(?:resolved|answered|addressed|satisfied|clarified|fixed|settled)\b/i.test(evidence))return clear('Your explanation suggests the concern may still be unresolved. Confirm what answered this specific concern before I mark it resolved. Nothing has changed.');
  const investors=listInvestors(actor).filter(investor=>[investor.name,investor.name.split(' ')[0],investor.company].some(candidate=>normalize(candidate)===normalize(name)));
  if(investors.length!==1)return clear('Use the full name of one investor you can access so I can find the correct concern. Nothing has changed.');
  const investor=investors[0],journey=getInvestorJourney(actor,investor.id);
  const words=normalize(topic).split(' ').filter(word=>word&&!['the','that','this','earlier','recorded'].includes(word));
  const matches=journey.openIssues.filter(issue=>words.every(word=>normalize(issue.text).includes(word)));
  if(matches.length!==1)return clear(matches.length?`More than one open concern matches for ${investor.name}:\n${matches.slice(0,5).map(issue=>`• ${issue.text}`).join('\n')}\nRepeat the request with the specific concern and what resolved it. Nothing has changed.`:`I couldn’t find one matching open concern for ${investor.name}. Review the investor journey or name the exact concern. Nothing has changed.`);
  return {kind:'concern',investorId:investor.id,investorName:investor.name,observationId:matches[0].id,text:evidence.trim(),propertyId:matches[0].propertyId};
}

/** Resolve target and intent from the current employee message; never from a model-selected ID. */
export function prepareConversationAction(actor:Actor,message:string,conversationId:string,options:ConversationActionOptions={}):PreparedConversationAction|null {
  scopedGet(actor,'conversations',conversationId,true);requireFeature(actor,'core');
  const choiceRequestId=options.requestId??newId('choice');
  const concern=prepareConcern(actor,message);if(concern)return concern;
  const focus=readConversationFocus(actor,conversationId,options.asOf);
  const text=withoutPunctuation(message),number=/^(?:number\s+)?([1-8])$/i.exec(text);
  let intent=taskActionIntent(message),selected:Task|undefined;
  const tasks=listPersonalTasks(actor).filter(task=>task.status==='open');
  if(!intent&&focus.pending&&focus.candidates.length){
    if(number){const candidate=focus.candidates[Number(number[1])-1];if(!candidate)return clear('Choose one of the listed task numbers. Nothing has changed.');selected=tasks.find(task=>task.id===candidate.id&&(task.version??0)===candidate.version);intent={...focus.pending,target:''};}
    else if(focus.pending.action==='reschedule'&&focus.candidates.length===1&&clock(text)){
      const candidate=focus.candidates[0];selected=tasks.find(task=>task.id===candidate.id&&(task.version??0)===candidate.version);
      const previousDate=focus.pending.dateText;
      // A clock correction replaces either “tomorrow at 9” or “tomorrow 9”.
      const day=previousDate?.trim().match(/^(today|tomorrow|(?:(?:this|next)\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|\d{4}-\d{2}-\d{2})(?:\s|$)/i)?.[1];
      intent={...focus.pending,target:'',dateText:previousDate?`${day??previousDate.replace(/\s+at\s+.*$/i,'')} at ${text}`:text};
    }
  }
  if(!intent)return null;
  intent.referenceAt??=options.asOf??new Date().toISOString();
  if(intent.action==='snooze'&&(!intent.minutes||!Number.isInteger(intent.minutes)||intent.minutes<1||intent.minutes>43200))return clear('How long should I snooze it? Say, for example, “snooze it for two hours” (between one minute and 30 days). Nothing has changed.');
  if(intent.dateText&&intent.dateText.length>240)return clear('Give a short date and time, such as “tomorrow at 9am”. Nothing has changed.');
  if(!selected){
    if(number)return clear('That task changed while you were choosing it. Name the task again so I can use its current details. Nothing has changed.');
    if(isPointer(intent.target)){
      const referenced=focus.candidates.map(candidate=>tasks.find(task=>task.id===candidate.id&&(task.version??0)===candidate.version)).filter((task):task is Task=>!!task);
      if(focus.status==='ready'&&referenced.length===1)selected=referenced[0];
      else return choices(actor,conversationId,referenced.length?referenced:tasks,intent,choiceRequestId,focus.status==='stale'?'The earlier task reference has changed. Which current task did you mean?':'Which task did you mean?',options.asOf?options.requestId:undefined);
    }else{
      const matching=namedTasks(actor,tasks,intent.target);
      if(matching.length===1)selected=matching[0];
      else return choices(actor,conversationId,matching.length?matching:tasks,intent,choiceRequestId,matching.length?'More than one task matches. Which one?':'I couldn’t match that title. Which task did you mean?',options.asOf?options.requestId:undefined);
    }
  }
  let dueAt:string|null|undefined;
  if(intent.action==='reschedule'){
    const date=parseTaskDate(intent.dateText,selected,new Date(intent.referenceAt));
    if(date.error){
      saveConversationChoices(actor,conversationId,{...(options.asOf&&options.requestId?{deliveryRequestId:options.requestId}:{}),tasks:[{id:selected.id,version:selected.version??0}],intent:{action:intent.action,...(intent.dateText?{dateText:intent.dateText}:{}),referenceAt:intent.referenceAt,requestId:choiceRequestId}});
      return clear(date.error);
    }
    dueAt=date.dueAt;
  }
  return {kind:'task',task:selected,action:intent.action,expectedVersion:selected.version??0,...(dueAt!==undefined?{dueAt}:{}),...(intent.minutes!==undefined?{minutes:intent.minutes}:{})};
}

/** Models may execute only a prepared action derived from the actual employee request. */
export function executePreparedConversationAction(actor:Actor,prepared:PreparedConversationAction,conversationId:string,requestId:string):ToolResult {
  scopedGet(actor,'conversations',conversationId,true);
  if(prepared.kind==='clarification')return prepared.result;
  if(prepared.kind==='concern'){
    const observation=recordJourneyObservation(actor,{investorId:prepared.investorId,kind:'resolved',resolvesId:prepared.observationId,text:prepared.text,eventKey:`chat-resolution:${fingerprint({conversationId,requestId})}`});
    return {message:`Marked ${prepared.investorName}’s concern resolved based on your report: “${observation.text}” The original concern remains in the journey, and the next recommendation will use its resolved status. Confirmed CRM criteria were not changed.`,specialistIds:[],artifacts:[{type:'briefing',id:prepared.investorId,title:'Updated investor journey',data:{investorId:prepared.investorId,propertyId:prepared.propertyId}}]};
  }
  const task=mutateTask(actor,prepared.task.id,{action:prepared.action,expectedVersion:prepared.expectedVersion,eventKey:`chat-task:${fingerprint({conversationId,requestId})}`,...(prepared.dueAt!==undefined?{dueAt:prepared.dueAt}:{}),...(prepared.minutes!==undefined?{minutes:prepared.minutes}:{})});
  const when=task.dueAt?new Date(task.dueAt).toLocaleString('en-US',{timeZone:timezone,dateStyle:'full',timeStyle:'short'}):null;
  const message=prepared.action==='complete'?`Done — “${task.title}” is marked complete.`:prepared.action==='cancel'?`Canceled “${task.title}”. It remains in your task history and will no longer trigger a reminder.`:when?`${prepared.action==='snooze'?'Snoozed':'Moved'} “${task.title}” to ${when} Eastern.`:`Removed the deadline from “${task.title}”. The task stays open without a scheduled reminder.`;
  return {message,specialistIds:['daily-coordinator'],artifacts:[{type:'task',id:task.id,title:task.title,data:task}],data:task};
}

export function executeConversationAction(actor:Actor,message:string,conversationId:string,requestId:string,options:ConversationActionOptions={}):ToolResult|null {
  const prepared=prepareConversationAction(actor,message,conversationId,{...options,requestId});
  if(!prepared)return null;
  try{return executePreparedConversationAction(actor,prepared,conversationId,requestId);}
  catch(error){if(error instanceof AppError&&error.status===409)return {message:`${error.message} Nothing else was changed. Ask again using the current task or concern.`,specialistIds:[],artifacts:[]};throw error;}
}
