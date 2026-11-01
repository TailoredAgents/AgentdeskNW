import type {HandoffItem,HandoffRecord} from '../lib/handoff-contracts';
import type {HandoffSource} from './handoff-sources';

/** Provisional explanations over existing scoped records; no action or outcome authority. */
export function explainHandoffPriority(input:{
 source:HandoffSource;record:HandoffRecord|null;assigneeName:string|null;
 sourceChanged:boolean;assigneeEligible:boolean;checkedAt:number;
}):{evidence:string[];nextStep:string} {
 const {source,record,sourceChanged,assigneeEligible,checkedAt}=input;
 const current=source.value,label=source.kind==='opportunity'?'Opportunity':'Release';
 const assignee=input.assigneeName??'The assigned employee';
 const active=current.status==='released'||current.status==='reviewing';
 if(!active)return {
  evidence:[`Why now: ${label} v${current.version} is ${current.status.replaceAll('_',' ')}. Its earlier assignment is retained for review, not active follow-through.`],
  nextStep:`Keep this ${source.kind} out of active follow-through. A manager should review the stopped source with its owner; a new assignment requires an active current source.`,
 };
 if(sourceChanged)return {
  evidence:[`Why now: the assignment applies to ${label.toLowerCase()} v${record!.releaseVersion}, while the current source is v${current.version}. Earlier acknowledgment and outcome reports are historical for this review.`],
  nextStep:`Manager: review the changed source with its owner, then prepare a fresh assignment if follow-through is still needed. Do not carry the old acknowledgment or reported outcome into the new version.${!assigneeEligible?' Select an employee who already has current source access; assignment does not grant access.':''}`,
 };
 if(record&&!assigneeEligible)return {
  evidence:[`Why now: ${assignee} no longer has current source access. The existing assignment cannot authorize further work.`],
  nextStep:'Manager: select an employee who already has current source access before preparing a fresh assignment. Assignment does not grant access.',
 };
 if(record?.state==='resolved')return {
  evidence:[`Review basis: this follow-up has a separate manager resolution${record.resolution?` recorded at ${record.resolution.reviewedAt}`:''}. An old follow-up or closing target does not reopen it.`],
  nextStep:'This follow-up is resolved; assess transaction progress separately. A recorded closing target does not establish that a closing occurred.',
 };

 const evidence:string[]=[];
 let nextStep:string;
 if(!record){
  evidence.push('Why now: no assignment or acknowledgment is recorded for this current source.');
  nextStep='Manager: assign a specific next step to an employee who already has access; first confirm who is handling this source.';
 }else if(record.state==='blocked'){
  evidence.push(`Why now: ${assignee} reported a blocker${record.outcome?` at ${record.outcome.reportedAt}`:''}; the current follow-up has no reviewed resolution.`);
  nextStep=`Manager: review ${assignee}'s blocker and supplied evidence with them, then agree the next useful step. A blocked report cannot be resolved as completed.`;
 }else if(record.state==='reported'){
  evidence.push(`Why now: ${assignee} reported the assigned next step completed${record.outcome?` at ${record.outcome.reportedAt}`:''}; separate manager review is outstanding.`);
  nextStep='Manager: review the reported outcome and its supplied evidence before resolving this follow-up. The next recorded step is manager review, not a request for the employee to repeat the completed-work claim.';
 }else if(!record.acknowledgedAt){
  evidence.push(`Why now: ${assignee} has not recorded acknowledgment of this current assignment.`);
  nextStep=`Ask ${assignee} to acknowledge this assignment and identify anything preventing the recorded next step. No acknowledgment here does not prove they have not received it elsewhere.`;
 }else{
  evidence.push(`${assignee} acknowledged this current assignment at ${record.acknowledgedAt}; no outcome is recorded yet.`);
  nextStep=`Obtain ${assignee}'s outcome and a source reference for the assigned next step. A completed personal reminder is not sufficient.`;
 }
 if(record&&Date.parse(record.dueAt)<checkedAt){
  evidence.push(`Follow-up deadline passed: ${record.dueAt}.${record.state==='reported'?' Manager review remains outstanding; this date alone does not establish employee failure.':''}`);
 }
 if(current.closingAt){
  const closing=Date.parse(current.closingAt);
  if(closing<checkedAt)evidence.push(`Recorded closing target has passed: ${current.closingAt}. Reconfirm actual status with the source owner; neither success nor a failed deal is established.`);
  else if(closing<=checkedAt+7*86400000)evidence.push(`Recorded closing target is within the provisional seven-day review window: ${current.closingAt}. It is a supplied target, not a confirmed closing.`);
  if(record&&closing<Date.parse(record.dueAt))evidence.push(`Timing conflict: the recorded closing target ${current.closingAt} precedes the follow-up deadline ${record.dueAt}. Review the timing with the responsible employee; neither date is changed automatically.`);
 }
 return {evidence,nextStep};
}

/** Equal-category ordering uses current relevant dates, never a retired assignment deadline. */
export function earliestHandoffDeadline(item:HandoffItem):number {
 if(!['released','reviewing'].includes(item.releaseStatus)||item.attention==='resolved')return Infinity;
 const dates=[item.closingAt,...(item.attention!=='source_changed'&&item.record?[item.record.dueAt]:[])];
 return Math.min(Infinity,...dates.filter((value):value is string=>!!value).map(Date.parse).filter(Number.isFinite));
}
