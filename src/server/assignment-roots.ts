import {AsyncLocalStorage} from 'node:async_hooks';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,assertActor,getDb,newId,now} from './db';
import {fingerprint} from './provider-runtime';

export interface AssignmentHost {kind:'turn'|'work'|'research';id:string}
export interface AssignmentBinding {
 id:string;rootId:string;host:AssignmentHost;parentId:string|null;legacy:boolean;createdAt:string;
}
interface BindingRow {id:string;root_id:string;host_kind:AssignmentHost['kind'];host_id:string;host_fingerprint:string;parent_id:string|null;created_at:string;legacy:number}
interface Scope {owner:string;binding:AssignmentBinding}
const context=new AsyncLocalStorage<Scope>();
const hostSchema=z.object({kind:z.enum(['turn','work','research']),id:z.string().min(1).max(150)}).strict();
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const ownerKey=(actor:Actor)=>JSON.stringify(owner(actor));
function hostFingerprint(actor:Actor,host:AssignmentHost):string {
 assertActor(actor);hostSchema.parse(host);
 if(host.kind==='turn'){
  const row=getDb().prepare('SELECT request_hash FROM assistant_turns WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=?').get(...owner(actor),host.id) as {request_hash:string}|undefined;
  if(row)return row.request_hash;
 }else if(host.kind==='work'){
  const row=getDb().prepare('SELECT request_hash FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=? AND id=?').get(...owner(actor),host.id) as {request_hash:string}|undefined;
  if(row)return row.request_hash;
 }else{
  const row=getDb().prepare('SELECT data FROM research_jobs WHERE organization_id=? AND office_id=? AND owner_id=? AND id=?').get(...owner(actor),host.id) as {data:string}|undefined;
  if(row){const job=JSON.parse(row.data) as {id:string;provider:string;createdAt:string};return fingerprint({id:job.id,provider:job.provider,createdAt:job.createdAt});}
 }
 throw new AppError(404,'This assignment source is not available in your private workspace.');
}
function projection(row:BindingRow):AssignmentBinding{return {id:row.id,rootId:row.root_id,host:{kind:row.host_kind,id:row.host_id},parentId:row.parent_id,legacy:!!row.legacy,createdAt:row.created_at};}
export function getAssignmentBinding(actor:Actor,host:AssignmentHost):AssignmentBinding|null {
 const expected=hostFingerprint(actor,host),row=getDb().prepare('SELECT b.*,r.legacy FROM assignment_bindings b JOIN assignment_roots r ON r.id=b.root_id WHERE b.organization_id=? AND b.office_id=? AND b.user_id=? AND b.host_kind=? AND b.host_id=?').get(...owner(actor),host.kind,host.id) as BindingRow|undefined;
 if(row&&row.host_fingerprint!==expected)throw new AppError(409,'The original assignment identity changed. Do not create a replacement spending root.');
 return row?projection(row):null;
}
/** Trusted server creation only. No caller/model chooses an assignment ID or its parent. */
export function bindAssignment(actor:Actor,host:AssignmentHost):AssignmentBinding {return bind(actor,host,false,false);}
function bind(actor:Actor,host:AssignmentHost,legacy:boolean,restore:boolean):AssignmentBinding {
 return getDb().transaction(()=>{
  const current=context.getStore();
  if(current&&current.owner!==ownerKey(actor))throw new AppError(403,'Assignment execution cannot change employee identity.');
  const prior=getAssignmentBinding(actor,host);
  if(prior){if(!restore&&current&&current.binding.rootId!==prior.rootId)throw new AppError(409,'This work already belongs to another assignment. Its spending root cannot be replaced.');return prior;}
  const parent=restore?undefined:current?.binding;
  if(parent){const latest=getAssignmentBinding(actor,parent.host);if(!latest||latest.id!==parent.id)throw new AppError(409,'The parent assignment is unavailable.');}
  const stamp=now(),rootId=parent?.rootId??newId('assignment'),bindingId=newId('assignment_binding');
  if(!parent)getDb().prepare('INSERT INTO assignment_roots VALUES(?,?,?,?,?,?)').run(rootId,...owner(actor),legacy?1:0,stamp);
  getDb().prepare('INSERT INTO assignment_bindings VALUES(?,?,?,?,?,?,?,?,?,?)').run(bindingId,rootId,...owner(actor),host.kind,host.id,hostFingerprint(actor,host),parent?.id??null,stamp);
  return getAssignmentBinding(actor,host)!;
 }).immediate();
}
/** Restore only a verified persisted host. Legacy work gets an explicitly incomplete historical root. */
export function withAssignment<T>(actor:Actor,host:AssignmentHost,run:()=>T):T {
 const binding=bind(actor,host,true,true);
 return context.run({owner:ownerKey(actor),binding},run);
}
/** A fresh delegated host must inherit its caller; its exact binding commits with its local creation. */
export function withNewAssignment<T>(actor:Actor,host:AssignmentHost,run:()=>T):T {
 const binding=bindAssignment(actor,host);
 return context.run({owner:ownerKey(actor),binding},run);
}
export function currentAssignment(actor:Actor):AssignmentBinding {
 assertActor(actor);const value=context.getStore();
 if(!value||value.owner!==ownerKey(actor))throw new AppError(409,'Paid work needs its original employee assignment before quoting or dispatch.');
 const current=getAssignmentBinding(actor,value.binding.host);
 if(!current||current.id!==value.binding.id)throw new AppError(409,'The original assignment is unavailable.');
 return current;
}
/** Optional trusted context lookup. Existing but invalid/cross-employee context still fails. */
export function activeAssignment(actor:Actor):AssignmentBinding|null {return context.getStore()?currentAssignment(actor):null;}
