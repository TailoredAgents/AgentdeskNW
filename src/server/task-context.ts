import type {Actor} from '../lib/contracts';
import type {PersonalTaskDetail} from '../lib/task-contracts';
import {AppError,getDb} from './db';
import {readInvestor} from './access';
import {featureAccess} from './billing';
import {getPersonalTask} from './task-actions';
import {getInboxThread} from './communications';

/** Personal work never grants access to its original private correspondence. */
export function getPersonalTaskDetail(actor:Actor,id:string):PersonalTaskDetail {
 const task=getPersonalTask(actor,id),investor=task.investorId?readInvestor(actor,task.investorId):null;
 const row=getDb().prepare("SELECT thread_id FROM communication_workflow_actions WHERE organization_id=? AND office_id=? AND owner_id=? AND json_extract(data,'$.kind')='follow_up' AND json_extract(data,'$.recordId')=? LIMIT 1").get(actor.organizationId,actor.officeId,actor.id,id) as {thread_id:string}|undefined;
 let source:PersonalTaskDetail['source']=null;
 if(row){try{const thread=getInboxThread(actor,row.thread_id);if(thread.bodyAccess==='full')source={type:'inbox',threadId:thread.thread.id,title:thread.thread.subject};}catch(error){if(!(error instanceof AppError&&[402,403,404].includes(error.status)))throw error;}}
 return {task,investor:investor?{id:investor.id,name:investor.name}:null,source,sourceNotice:source?'Created from your reviewed Inbox follow-up.':row?'The original correspondence is currently unavailable. Your saved personal task remains separate.':'Personal task. Completing it does not confirm an investor response or resolve a deal concern.',canEdit:featureAccess(actor,'core').allowed&&featureAccess(actor,'daily-coordinator').allowed};
}
