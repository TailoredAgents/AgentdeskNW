import type {Actor} from '../lib/contracts';
import type {ChatRequestState} from '../lib/chat-request-contracts';
import {AppError,getDb} from './db';
import {getConversation} from './services';
/** Read-only reconciliation. Never retries, creates, resumes or settles a turn. */
export function getChatRequest(actor:Actor,conversationId:string,requestId:string):ChatRequestState {
 const conversation=getConversation(actor,conversationId);
 const row=getDb().prepare('SELECT conversation_id,status,result FROM assistant_turns WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=?').get(actor.organizationId,actor.officeId,actor.id,requestId) as {conversation_id:string;status:string;result:string|null}|undefined;
 if(row&&row.conversation_id!==conversationId)throw new AppError(404,'This request is not part of the selected conversation.');
 const messageId=row?.status==='completed'&&row.result?(JSON.parse(row.result) as {messageId:string}).messageId:null;
 const completed=!!messageId&&conversation.messages.some(message=>message.id===messageId&&message.role==='assistant');
 const status=!row?'not_found':completed?'completed':'running';
 return {requestId,status,conversation,messageId:completed?messageId:null,notice:status==='completed'?'The saved response is available. No request was repeated.':status==='not_found'?'No saved request was found. Retry the same request to preserve its identity.':'This request is still running or needs recovery. Review saved jobs and approvals; checking again does not repeat its work.'};
}
