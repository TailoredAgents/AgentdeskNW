import type {Role} from './contracts';
export type HandoffState='assigned'|'acknowledged'|'blocked'|'reported'|'resolved';
export interface HandoffRecord {
 id:string;releaseId:string;releaseVersion:number;version:number;assignedTo:string;assignedBy:string;
 nextAction:string;dueAt:string;state:HandoffState;acknowledgedAt:string|null;
 outcome:{kind:'blocked'|'resolved';note:string;evidence:string;reportedBy:string;reportedAt:string}|null;
 resolution:{note:string;reviewedBy:string;reviewedAt:string}|null;createdAt:string;updatedAt:string;
}
export interface HandoffItem {
 sourceKind?:'release'|'opportunity';
 releaseId:string;releaseVersion:number;address:string;source:string;releasedAt:string|null;closingAt:string|null;
 stage:string;releaseStatus:'draft'|'released'|'withdrawn'|'reviewing'|'not_pursuing';owner:{id:string;name:string};
 record:HandoffRecord|null;assigneeName:string|null;sourceChanged:boolean;
 attention:'source_changed'|'blocked'|'overdue'|'review'|'closing_soon'|'untracked'|'waiting'|'resolved';
 evidence:string[];nextStep:string;eligibleAssignees:{id:string;name:string;role:Role}[];
 actions:('assign'|'acknowledge'|'report'|'resolve')[];history:{actorName:string;action:string;record:HandoffRecord}[];
}
export interface HandoffBoard {
 metrics?:{visible:number;active:number;unassigned:number;unresolvedAssigned:number;overdue:number;awaitingAcknowledgment:number;blocked:number;awaitingReview:number;resolved:number;changedSource:number;notice:string};
 items:HandoffItem[];checkedAt:string;summary:string;handoffAccessReference:string;
 method:{id:string;version:number;source:string;notice:string};
}
export type HandoffMutation={eventKey:string;expectedVersion:number;expectedReleaseVersion:number}&(
 {action:'assign';assignedTo:string;nextAction:string;dueAt:string}|
 {action:'acknowledge'}|{action:'report';kind:'blocked'|'resolved';note:string;evidence:string}|
 {action:'resolve';note:string}
);
export const handoffLabels:Record<HandoffItem['attention'],string>={source_changed:'Source changed',blocked:'Blocked',overdue:'Follow-up overdue',review:'Outcome needs review',closing_soon:'Closing target approaching',untracked:'No tracked handoff',waiting:'In progress',resolved:'Follow-up resolved'};
export function handoffReviewCurrent(item:HandoffItem|null,input:HandoffMutation){return !!item&&['released','reviewing'].includes(item.releaseStatus)&&item.releaseVersion===input.expectedReleaseVersion&&(item.record?.version??0)===input.expectedVersion&&item.actions.includes(input.action);}

export type HandoffForm={action:HandoffMutation['action'];assignedTo:string;nextAction:string;date:string;time:string;kind:'blocked'|'resolved';note:string;evidence:string};
export const handoffActionLabels={assign:'Assign next step',acknowledge:'Acknowledge assignment',report:'Record outcome',resolve:'Resolve reviewed follow-up'};
export function newHandoffForm(item:HandoffItem,action:HandoffForm['action']):HandoffForm {
 const date=new Date(Date.now()+86400000);return {action,assignedTo:item.record?.assignedTo??item.eligibleAssignees[0]?.id??'',nextAction:item.record?.nextAction??'Confirm this handoff and record the missing information.',date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,time:'09:00',kind:'blocked',note:'',evidence:''};
}
export function handoffFormMutation(item:HandoffItem,form:HandoffForm,eventKey:string):HandoffMutation {
 const base={expectedVersion:item.record?.version??0,expectedReleaseVersion:item.releaseVersion,eventKey};
 if(form.action==='assign'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(form.date)||!/^\d{2}:\d{2}$/.test(form.time))throw new Error('Use YYYY-MM-DD and a 24-hour time such as 09:00.');
  const [year,month,day]=form.date.split('-').map(Number),[hour,minute]=form.time.split(':').map(Number),due=new Date(year,month-1,day,hour,minute);
  if(due.getFullYear()!==year||due.getMonth()!==month-1||due.getDate()!==day||due.getHours()!==hour||due.getMinutes()!==minute||due.getTime()<=Date.now())throw new Error('Choose a valid future date and local time.');
  if(form.nextAction.trim().length<6)throw new Error('Describe the next step in at least six characters.');
  return {...base,action:'assign',assignedTo:form.assignedTo,nextAction:form.nextAction.trim(),dueAt:due.toISOString()};
 }
 if(form.action==='acknowledge')return {...base,action:'acknowledge'};
 if(form.note.trim().length<6)throw new Error('Describe the outcome or review in at least six characters.');
 if(form.action==='resolve')return {...base,action:'resolve',note:form.note.trim()};
 if(form.evidence.trim().length<6)throw new Error('Provide a source reference for this reported outcome.');
 return {...base,action:'report',kind:form.kind,note:form.note.trim(),evidence:form.evidence.trim()};
}
export function handoffDecisionText(item:HandoffItem,input:HandoffMutation):string {
 const detail=input.action==='assign'?`Responsible employee: ${item.eligibleAssignees.find(p=>p.id===input.assignedTo)?.name??'Unavailable'}\nNext step: ${input.nextAction}\nDue: ${new Date(input.dueAt).toLocaleString('en-US',{timeZone:'America/New_York',timeZoneName:'short'})}\nThis starts a fresh assignment; any previous acknowledgment/outcome stays in history.`:input.action==='report'?`Employee-reported ${input.kind==='resolved'?'next step completed':'blocker'}\n${input.note}\nSource reference: ${input.evidence}\nThis report still needs management review before resolution.`:input.action==='resolve'?`Employee report: ${item.record?.outcome?.note??"Unavailable"}\nEvidence reference: ${item.record?.outcome?.evidence??"Unavailable"}\nManagement review: ${input.note}\nResolve this follow-up based on the displayed employee report and evidence.`:'Acknowledge that you have received this specific assignment. This does not confirm deal completion.';
 return `${item.address} · ${item.sourceKind==='opportunity'?'Opportunity':'Release'} v${input.expectedReleaseVersion} · Follow-up v${input.expectedVersion}\n${detail}\nShared operational record only. No message is sent and no transaction or personal task is marked complete.`;
}
