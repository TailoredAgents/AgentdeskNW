import type {Actor} from '../lib/contracts';
import {getDb} from './db';
import {actorForMember} from './services';
import {textProviderConfig} from './provider-config';
import {resumeApprovedTextRequest} from './orchestrator';

/** Only exact employee-approved reviews become eligible. It never re-leases claimed work; a completed receipt may still be published once. */
export async function processApprovedTextRequests(actor?:Actor,limit=1){
 if(!process.env.OPENAI_API_KEY||textProviderConfig().spendingMode!=='admitted_demo')return 0;
 const rows=getDb().prepare(`SELECT e.organization_id,e.office_id,e.user_id,e.request_id,r.id review_id FROM text_executions e JOIN assignment_reviews r ON r.id=json_extract(e.data,'$.metering.reviewId') AND r.organization_id=e.organization_id AND r.office_id=e.office_id AND r.user_id=e.user_id JOIN metered_assignments m ON m.id=r.assignment_id AND m.organization_id=e.organization_id AND m.office_id=e.office_id AND m.user_id=e.user_id WHERE ((e.phase IN ('ready','received') AND r.state='ready' AND NOT EXISTS(SELECT 1 FROM assignment_text_controls c WHERE c.review_id=r.id AND c.state IN ('requested','paused')) AND json_extract(m.data,'$.stopRequested') IS NULL AND json_extract(m.data,'$.status') IN ('quoted','active')) OR (e.phase='completed' AND r.state='claimed')) ${actor?'AND e.organization_id=? AND e.office_id=? AND e.user_id=?':''} ORDER BY r.updated_at,r.id LIMIT 20`).all(...(actor?[actor.organizationId,actor.officeId,actor.id]:[])) as {organization_id:string;office_id:string;user_id:string;request_id:string;review_id:string}[];
 let count=0;
 for(const row of rows){if(count>=Math.max(1,Math.min(5,limit)))break;try{const owner=actorForMember(row.organization_id,row.office_id,row.user_id);if(await resumeApprovedTextRequest(owner,row.request_id,row.review_id))count++;}catch{/* Unclaimed invalid/expired/unfunded reviews remain available for employee review; no dispatch occurred. */}}
 return count;
}
