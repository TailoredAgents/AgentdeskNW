export interface PendingChatRequest {requestId:string;conversationId?:string;message:string}
/** Restoring a request is not permission to change its text or conversation. */
export function parsePendingChat(raw:string|null):PendingChatRequest|null {
 try{const value=JSON.parse(raw??'null');if(!value||typeof value!=='object'||typeof value.requestId!=='string'||!value.requestId||value.requestId.length>150||typeof value.message!=='string'||!value.message.trim()||value.message.length>12000||value.conversationId!==undefined&&(typeof value.conversationId!=='string'||!value.conversationId||value.conversationId.length>150))return null;return {requestId:value.requestId,conversationId:value.conversationId,message:value.message};}catch{return null;}
}
export function pendingChatMatches(pending:PendingChatRequest,message:string,conversationId?:string){return pending.message===message.trim()&&pending.conversationId===conversationId;}
