import type {MeteredAssignment} from '../lib/metered-work-contracts';
import type {AssignmentActivity} from '../lib/assignment-review-contracts';

/** Only call after current employee, host, quote and source authorization. */
export function assignmentActivity(assignment:MeteredAssignment,labels:{key:string;label:string}[]):AssignmentActivity {
 const pending=(status:string)=>status==='dispatched'||status==='unknown';
 return {
  parts:labels.map(label=>{
   const attempts=assignment.attempts.filter(attempt=>attempt.partKey===label.key);
   return {...label,started:attempts.length,confirmed:attempts.filter(a=>!pending(a.status)).length,
    failed:attempts.filter(a=>a.status==='failed'||a.status==='canceled').length,
    pending:attempts.filter(a=>pending(a.status)).length,
    recordedMicros:attempts.reduce((sum,a)=>sum+(a.customerMicros??0),0)};
  }),
  pending:assignment.attempts.filter(a=>pending(a.status)).length,
  overrun:assignment.attempts.some(a=>!!a.discrepancy),
 };
}
