import type {Actor} from '../lib/contracts';
import type {MeteredPart,UsageUnits} from '../lib/metered-work-contracts';
import {AppError,getDb} from './db';
import {currentAssignment} from './assignment-roots';
import {quoteMeteredAssignment,getMeteredAssignment,admitMeteredAttempt} from './metered-work';

function key(actor:Actor){
 const binding=currentAssignment(actor);
 if(binding.legacy)throw new AppError(409,'This older assignment has incomplete spending history. It cannot enter paid admission as a fresh zero-spend assignment.');
 return `root:${binding.rootId}`;
}
/** Trusted host boundary: every part and continuation quotes the same root; never accept a caller root. */
export function quoteCurrentAssignment(actor:Actor,input:{title:string;scopeHash:string;revision:number;parts:MeteredPart[]}){
 if('assignmentKey' in input||'assignmentId' in input)throw new AppError(400,'A caller cannot choose the spending root.');
 return quoteMeteredAssignment(actor,{...input,assignmentKey:key(actor)});
}
export function currentMeteredAssignment(actor:Actor){
 const assignmentKey=key(actor),row=getDb().prepare('SELECT id FROM metered_assignments WHERE organization_id=? AND office_id=? AND user_id=? AND assignment_key=?').get(actor.organizationId,actor.officeId,actor.id,assignmentKey) as {id:string}|undefined;
 if(!row)throw new AppError(409,'Prepare the whole-assignment quote before requesting paid work.');
 return getMeteredAssignment(actor,row.id);
}
/** This host boundary can neither swap budgets nor approve them. Receipt/decision services stay separate. */
export function admitCurrentAssignmentAttempt(actor:Actor,input:{revision:number;scopeHash:string;attemptId:string;partKey:string;requestHash:string;bounds:UsageUnits}){
 if('assignmentId' in input||'assignmentKey' in input)throw new AppError(400,'A caller cannot choose the spending root.');
 const assignment=currentMeteredAssignment(actor);
 return admitMeteredAttempt(actor,{...input,assignmentId:assignment.id});
}
