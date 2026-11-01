import type {Artifact,Conversation,Message,ToolResult} from './contracts';
import type {ChatRequestLookupState} from './chat-request-contracts';

const invalidResponse='The saved conversation could not be read. Check the saved result again before retrying your request.';
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(item=>typeof item==='string');
function artifact(value:unknown):value is Artifact {
 return record(value)&&typeof value.type==='string'&&!!value.type&&typeof value.title==='string'&&(value.id===undefined||typeof value.id==='string');
}
function message(value:unknown):value is Message {
 if(!record(value)||typeof value.id!=='string'||!value.id||typeof value.role!=='string'||!['user','assistant'].includes(value.role)||typeof value.content!=='string'||typeof value.createdAt!=='string'||!strings(value.specialistIds)||!Array.isArray(value.artifacts)||!value.artifacts.every(artifact))return false;
 return value.historyNotice===undefined||record(value.historyNotice)&&typeof value.historyNotice.reason==='string'&&['draft_context_changed','source_unavailable'].includes(value.historyNotice.reason)&&typeof value.historyNotice.message==='string';
}
/** Validate the fields consumed by chat rendering; artifact data remains opaque, never authority. */
export function parseConversation(value:unknown):Conversation {
 if(!record(value)||typeof value.id!=='string'||!value.id||typeof value.title!=='string'||typeof value.createdAt!=='string'||typeof value.updatedAt!=='string'||!Array.isArray(value.messages)||!value.messages.every(message))throw new Error(invalidResponse);
 return value as unknown as Conversation;
}

export function parseChatResponse(value:unknown,expectedConversationId?:string):{conversation:Conversation;result:ToolResult} {
 if(!record(value)||!record(value.result)||typeof value.result.message!=='string'||!strings(value.result.specialistIds)||!Array.isArray(value.result.artifacts)||!value.result.artifacts.every(artifact))throw new Error(invalidResponse);
 const conversation=parseConversation(value.conversation);
 if(expectedConversationId!==undefined&&conversation.id!==expectedConversationId)throw new Error(invalidResponse);
 return {conversation,result:value.result as unknown as ToolResult};
}

/** A read-only check must correspond to the pending request, including its known conversation. */
export function parseChatRequestLookup(value:unknown,expected:{requestId:string;conversationId?:string}):ChatRequestLookupState {
 if(!record(value)||value.requestId!==expected.requestId||typeof value.status!=='string'||!['not_found','running','completed'].includes(value.status)||typeof value.notice!=='string')throw new Error(invalidResponse);
 if(value.conversation===null){
  if(value.status!=='not_found'||value.messageId!==null||expected.conversationId!==undefined)throw new Error(invalidResponse);
  return value as unknown as ChatRequestLookupState;
 }
 const conversation=parseConversation(value.conversation);
 if(expected.conversationId!==undefined&&conversation.id!==expected.conversationId)throw new Error(invalidResponse);
 if(value.status==='completed'){
  if(typeof value.messageId!=='string'||!conversation.messages.some(item=>item.id===value.messageId&&item.role==='assistant'))throw new Error(invalidResponse);
 }else if(value.messageId!==null)throw new Error(invalidResponse);
 return value as unknown as ChatRequestLookupState;
}
