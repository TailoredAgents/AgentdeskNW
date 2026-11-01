import {transactionMilestones,transactionMilestoneLabels,type TransactionInput,type TransactionPreparation,type TransactionReview} from '../lib/transaction-contracts';
export const transactionReviewMethod='transaction-follow-through-v3';
/** Independent employee reports remain independent. This review never advances a deal stage. */
export function reviewTransactionReports(input:TransactionInput,preparation:TransactionPreparation,asOf:string):TransactionReview {
 const reports=transactionMilestones.flatMap(key=>{const report=input.milestones[key];return report?[{milestone:key,label:transactionMilestoneLabels[key],date:report.date,source:report.source,note:report.note}]:[];});
 const unresolved=input.issues.filter(issue=>!issue.resolved).sort((a,b)=>(a.dueDate??'9999').localeCompare(b.dueDate??'9999'));
 const inconsistencies:string[]=[];
 const dependencies=[['title_opened','agreement'],['title_opened','deposit'],['title_cleared','title_opened'],['signed','title_cleared'],['funded','signed'],['closed','funded']] as const;
 for(const [later,earlier] of dependencies){const a=input.milestones[later],b=input.milestones[earlier];if(!a)continue;
  if(!b)inconsistencies.push(`${transactionMilestoneLabels[later]} is reported (${a.date}; ${a.source}) but ${transactionMilestoneLabels[earlier].toLowerCase()} is not. Confirm the history and any exception; do not infer it.`);
  else if(a.date<b.date)inconsistencies.push(`${transactionMilestoneLabels[later]} is dated ${a.date}, before ${transactionMilestoneLabels[earlier].toLowerCase()} (${b.date}). Reconcile the reports and any exception with their sources.`);
 }
 if(input.milestones.title_cleared&&unresolved.length)inconsistencies.push('Title clearance is reported while issues remain open. Confirm whether each issue affects clearance or is a separate follow-up; do not silently mark it resolved.');
 const changedSources=preparation.gaps.filter(gap=>/changed or withdrawn|source.*unavailable/i.test(gap));
 const overdue=unresolved.filter(issue=>issue.dueDate&&issue.dueDate<asOf),closingOverdue=!!input.closingDate&&input.closingDate<asOf&&!input.milestones.closed;
 const nextMissing=transactionMilestones.find(key=>!input.milestones[key]);
 const attorney=input.parties.attorney?`the closing attorney ${input.parties.attorney.name} (contact source: ${input.parties.attorney.source})`:'the closing attorney';
 const closingContext=closingOverdue?` The proposed closing date ${input.closingDate} has passed without a closing report. Confirm the actual status and next target with the closing parties.`:input.closingDate===asOf&&!input.milestones.closed?` The proposed closing is today (${input.closingDate}); confirm readiness with the closing parties.`:'';
 let nextAction:string;
 if(changedSources.length)nextAction=changedSources[0];
 else if(inconsistencies.length)nextAction=inconsistencies[0];
 else if(unresolved.length){
  const issue=unresolved[0],timing=issue.dueDate?(issue.dueDate<asOf?'overdue':issue.dueDate===asOf?'due today':'open'):'undated';
  const target=issue.dueDate?` Target ${issue.dueDate}.`:' No follow-up date is recorded; agree on one.';
  const afterClosing=issue.dueDate&&input.closingDate&&issue.dueDate>input.closingDate&&!input.milestones.closed?` This target falls after the proposed closing (${input.closingDate}); confirm whether it affects closing or is a separate follow-up.`:'';
  nextAction=`Review ${timing} issue: ${issue.description}. Source: ${issue.source}.${target} Confirm who owns this issue and request its actual outcome.${afterClosing}${closingContext}`;
 }else if(closingOverdue)nextAction=closingContext.trim();
 else {
  const missingOpening=(['agreement','deposit'] as const).filter(key=>!input.milestones[key]);
  if(missingOpening.length)nextAction=`Obtain the missing employee ${missingOpening.length===1?'report':'reports'} for ${missingOpening.map(key=>transactionMilestoneLabels[key].toLowerCase()).join(' and ')} and the current supporting source before preparing title opening. Keep the reports already recorded; source text alone does not confirm these events.`;
  else if(!input.milestones.title_opened)nextAction=preparation.ready?'Review the current title-opening draft and exact parties/files. A saved or simulated-sent email does not establish that title was opened.':`${preparation.gaps[0]??'Review the current title preparation.'} The agreement and deposit are already reported; resolve this preparation gap without inventing another outcome.`;
  else if(nextMissing==='title_cleared')nextAction=`Ask ${attorney} for the current title-review status, unresolved items and source-backed clearance report. Title opening is reported; do not infer clearance from elapsed time.`;
  else if(nextMissing==='signed')nextAction='Confirm signing arrangements with the closing parties and obtain the actual signing report; clearance alone is not a signature.';
  else if(nextMissing==='funded')nextAction='Request the actual funds-disbursement report from the closing parties; signed documents alone do not establish payment.';
  else if(nextMissing==='closed')nextAction='Confirm the closing outcome and remaining follow-up with the closing parties; funding alone is not a recorded closing.';
  else nextAction='All seven milestones are reported. Review the reports and any remaining follow-through; this is not independent verification of closing.';
  nextAction+=closingContext;
 }

 return {method:transactionReviewMethod,asOf,reports,unreported:transactionMilestones.filter(key=>!input.milestones[key]).map(key=>transactionMilestoneLabels[key]),inconsistencies,changedSources,openIssues:unresolved,overdueIssueCount:overdue.length,closingOverdue,nextAction,notice:'Provisional coordination review of independent employee reports. No deal stage, issue, reservation, payment or title status was changed.'};
}
