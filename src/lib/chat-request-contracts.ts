import type {Conversation} from './contracts';
export interface ChatRequestState {requestId:string;status:'not_found'|'running'|'completed';conversation:Conversation;messageId:string|null;notice:string}
export type ChatRequestLookupState=ChatRequestState|{requestId:string;status:'not_found';conversation:null;messageId:null;notice:string};
