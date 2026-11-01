import {ApiResponseError,readApiResponse,transportFailureMessage} from '../../src/lib/api-response';
import {parseWorkspaceLink} from '../../src/lib/workspace-links';
import type {Actor,Conversation,ToolResult} from '../../src/lib/contracts';
export interface MobileConnection {origin:string;token:string;expiresAt:string;actor:Actor;conversationId:string;sessionId:string}
export interface PairResponse extends Omit<MobileConnection,'origin'> {}
export interface MobileSession extends Omit<PairResponse,'token'> {}
export interface ChatResponse {conversation:Conversation;result:ToolResult}
export class ApiError extends Error {constructor(message:string,readonly status:number){super(message);this.name='ApiError';}}
/** Access failures retire private views; transport failures keep foreground drafts for recovery. */
export function isAccessFailure(error:unknown){return error instanceof ApiError&&[401,402,403,404].includes(error.status);}
export function normalizeOrigin(raw:string,allowLocalDevelopment=false):string {
 let url:URL;try{url=new URL(raw.trim());}catch{throw new Error('Enter the complete workspace address, including https://.');}
 if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error('Use only the workspace address, without a path, password or query.');
 const host=url.hostname.toLowerCase(),parts=host.split('.').map(Number);
 const privateIpv4=parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===127);
 const local=host==='localhost'||host==='[::1]'||privateIpv4;
 if(url.protocol!=='https:'&&!(allowLocalDevelopment&&url.protocol==='http:'&&local))throw new Error('Use HTTPS. Local HTTP is available only in an explicitly enabled development build.');
 return url.origin;
}
export type FetchLike=(input:string,init?:RequestInit)=>Promise<Response>;
export function createApi(origin:string,token:string,fetcher:FetchLike=fetch){
 return async function request<T>(path:string,body?:unknown,method:'POST'|'PATCH'='POST'):Promise<T>{
  if(!/^\/[a-z][a-z0-9_/?=&%.-]*$/i.test(path)||path.includes('..')||path.includes('//'))throw new Error('Unsupported application request.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),100_000);
  try{
   let response:Response;
   try{response=await fetcher(`${origin}/api${path}`,{method:body===undefined?'GET':method,headers:{Accept:'application/json','Content-Type':'application/json','X-AgentDesk-Request':'1',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store'});}
   catch(error){throw new ApiError(transportFailureMessage(error),0);}
   try{return await readApiResponse<T>(response);}
   catch(error){if(error instanceof ApiResponseError)throw new ApiError(error.message,error.status);throw error;}
  }
  finally{clearTimeout(timer);}
 };
}
/** Keep one identity for an uncertain request; retries never silently create new work. */
export class RequestIdentity {
 private pending:{signature:string;id:string}|null=null;
 constructor(private newId:()=>string){}
 for(signature:string){if(this.pending&&this.pending.signature!==signature)throw new Error('Check or retry the outstanding request before starting different work.');if(!this.pending)this.pending={signature,id:this.newId()};return this.pending.id;}
 complete(id:string){if(this.pending?.id===id)this.pending=null;}
 clear(){this.pending=null;}
 get id(){return this.pending?.id??null;}
 get outstanding(){return this.pending!==null;}
}
/** Ignore late responses after sign-out, re-pairing, or background privacy clearing. */
export class SessionEpoch {private current=0;next(){return ++this.current;}capture(){return this.current;}matches(value:number){return value===this.current;}}
export function workIdFromUrl(raw:string):string|null {const target=parseWorkspaceLink(raw);return target?.kind==='work'?target.id:null;}
export function updateIdFromUrl(raw:string):string|null {const target=parseWorkspaceLink(raw);return target?.kind==='updates'?target.id:null;}
