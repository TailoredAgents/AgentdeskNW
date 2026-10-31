import {fingerprint} from './provider-runtime';
import type {TextReplyTarget} from './text-delivery';
import type {Actor,Artifact,ToolResult} from '../lib/contracts';
import {AppError,getDb,now} from './db';
import {currentAssignment} from './assignment-roots';
import {requireFeature} from './billing';
import {textProviderConfig} from './provider-config';

export type TextPhase='ready'|'dispatching'|'received'|'completed'|'failed'|'unknown';
export interface TextState {
 config:ReturnType<typeof textProviderConfig>;prefix:Record<string,unknown>[];items:Record<string,unknown>[];
 contextManifest?:Record<string,string>;round:number;roundLimit?:number;toolLimit?:number;retiredMeteredParts?:string[];revisedInstructions?:string;toolCount:number;handled:string[];artifacts:Artifact[];specialistIds:string[];
 response:Record<string,unknown>|null;result:ToolResult|null;
 request?:{message:string;instructions:string;channel:'web'|'mobile'|'sms'|'slack';receivedAt?:string;replyTarget?:TextReplyTarget};
 metering?:{assignmentId:string;revision:number;scopeHash:string;partKey:string;reviewId:string;continuationToken?:string;inputCount?:number};
}
export interface TextExecution {requestId:string;conversationId:string;bindingId:string;identityHash:string;version:number;phase:TextPhase;scopeHash:string;data:TextState}
type Row={request_id:string;conversation_id:string;binding_id:string;identity_hash:string;version:number;phase:TextPhase;scope_hash:string;data:string};
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function read(actor:Actor,requestId:string):TextExecution|null {
 const binding=currentAssignment(actor);
 if(binding.host.kind!=='turn'||binding.host.id!==requestId||binding.legacy)throw new AppError(409,'Text execution must retain its original current conversation assignment.');
 const row=getDb().prepare('SELECT * FROM text_executions WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=?').get(...owner(actor),requestId) as Row|undefined;
 if(!row)return null;
 if(row.binding_id!==binding.id)throw new AppError(409,'Text execution belongs to a different original assignment.');
 return {requestId:row.request_id,conversationId:row.conversation_id,bindingId:row.binding_id,identityHash:row.identity_hash,version:row.version,phase:row.phase,scopeHash:row.scope_hash,data:JSON.parse(row.data) as TextState};
}
/** Server-owned state, not a model/client resume payload. Opening a saved execution never dispatches. */
export function openTextExecution(actor:Actor,input:{requestId:string;conversationId:string;identityHash:string;scopeHash:string;initial:TextState}):TextExecution {
 requireFeature(actor,'core');return getDb().transaction(()=>{
  const prior=read(actor,input.requestId);
  if(prior){if(prior.conversationId!==input.conversationId||prior.identityHash!==input.identityHash)throw new AppError(409,'The saved AI execution has different instructions or configuration.');return prior;}
  const turn=getDb().prepare('SELECT conversation_id FROM assistant_turns WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=?').get(...owner(actor),input.requestId) as {conversation_id:string}|undefined;
  if(turn?.conversation_id!==input.conversationId)throw new AppError(409,'The original conversation turn does not match this execution.');
  const stamp=now();getDb().prepare('INSERT INTO text_executions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...owner(actor),input.requestId,input.conversationId,currentAssignment(actor).id,input.identityHash,1,'ready',input.scopeHash,JSON.stringify(input.initial),stamp,stamp);
  return read(actor,input.requestId)!;
 }).immediate();
}
export const readTextExecution=read;
const transitions:Record<TextPhase,TextPhase[]>={ready:['ready','dispatching','completed','failed'],dispatching:['received','failed','unknown'],received:['received','ready','completed','failed'],completed:[],failed:[],unknown:['failed']};
/** Compare-and-swap inside the same transaction as the corresponding allowance/receipt/tool writes.
 * A dispatch claim has no automatic lease expiry: an uncertain provider call must not be repeated.
 */
export function advanceTextExecution(actor:Actor,expected:TextExecution,phase:TextPhase,data:TextState,scopeHash=expected.scopeHash):TextExecution {
 return getDb().transaction(()=>{
  const current=read(actor,expected.requestId);
  if(!current||current.version!==expected.version||current.phase!==expected.phase)throw new AppError(409,'This AI execution advanced elsewhere. Read its saved progress before continuing.');
  if(!transitions[current.phase].includes(phase))throw new AppError(409,'This saved AI execution cannot make that transition.');
  if(phase==='dispatching')requireFeature(actor,'core');
  getDb().prepare('UPDATE text_executions SET version=version+1,phase=?,scope_hash=?,data=?,updated_at=? WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=? AND version=?').run(phase,scopeHash,JSON.stringify(data),now(),...owner(actor),current.requestId,current.version);
  return read(actor,current.requestId)!;
 }).immediate();
}

/** Category hashes contain no old record content and support a reviewable source change list. */
export function textContextManifest(scope:unknown):Record<string,string>{return Object.fromEntries(Object.entries(scope as Record<string,unknown>).map(([key,value])=>[key,fingerprint(value)]));}
