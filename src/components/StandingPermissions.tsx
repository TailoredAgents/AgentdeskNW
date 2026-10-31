'use client';
import {useEffect,useRef,useState} from 'react';
import type {StandingPermission,StandingPermissionState} from '@/lib/standing-permission-contracts';
import {api,ApiError} from './ui';
export function StandingPermissions({threadId,version,disabled}:{threadId:string;version:number;disabled:boolean}){
 const [value,setValue]=useState<StandingPermissionState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pendingAction,setPendingAction]=useState<string|null>(null);
 const alive=useRef(true),lock=useRef(false),pending=useRef<{action:string;path:string;body:unknown}|null>(null);
 const path=`/inbox/${encodeURIComponent(threadId)}`;
 useEffect(()=>{alive.current=true;let current=true;void api<StandingPermissionState>(`${path}/routine-permissions`).then(data=>{if(current)setValue(data);}).catch(e=>{if(current){setValue(null);setError(e instanceof Error?e.message:'Could not load permissions.');}});return()=>{current=false;alive.current=false;};},[path,version]);
 async function act(permission?:StandingPermission){
  const action=permission?.id??'grant';if(lock.current||pending.current&&pending.current.action!==action||!permission&&!value?.preview)return;
  lock.current=true;setBusy(true);setError('');
  const request=pending.current??{action,path:`${path}/${permission?'revoke-permission':'routine-permissions'}`,body:permission?{permissionId:permission.id,expectedVersion:permission.version,eventKey:crypto.randomUUID()}:{...value!.preview,eventKey:crypto.randomUUID()}};pending.current=request;setPendingAction(action);
  try{await api(request.path,request.body);pending.current=null;setPendingAction(null);const next=await api<StandingPermissionState>(`${path}/routine-permissions`);if(alive.current)setValue(next);}
  catch(e){if(e instanceof ApiError&&e.status>=400&&e.status<500){pending.current=null;setPendingAction(null);}if(alive.current)setError(e instanceof Error?e.message:'Permission outcome is uncertain. Retry the same choice.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="inbox-investor-context"><summary>Routine follow-ups{value?.permissions.some(p=>p.state==='active')?' · permission active':''}</summary>{error&&<p role="alert">{error}</p>}{value&&<><p>{value.notice}</p>{value.permissions.map(permission=><div key={permission.id}><strong>{permission.title}</strong><p className="muted">{permission.state} · {permission.usedActions} of {permission.maxActions} follow-ups · at most once every {permission.cooldownHours} hours · due in {permission.dueHours} hours · expires {new Date(permission.expiresAt).toLocaleString()}</p>{permission.state!=='revoked'&&<button className="button secondary" disabled={disabled||busy||!!pendingAction&&pendingAction!==permission.id} onClick={()=>void act(permission)}>Revoke permission</button>}</div>)}{value.preview&&!value.permissions.some(p=>p.state==='active')&&<><p>Task title: <strong>{value.preview.title}</strong>. Applies to future replies only.</p><button className="button secondary" disabled={disabled||busy||!!pendingAction&&pendingAction!=='grant'} onClick={()=>void act()}>Allow these follow-ups for 7 days</button></>}</>}</details>;
}
