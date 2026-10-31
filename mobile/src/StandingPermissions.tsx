import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import type {StandingPermission,StandingPermissionState} from '../../src/lib/standing-permission-contracts';
import {Button} from './Button';
import {ApiError} from './client';
import {styles as s} from './styles';
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
export function StandingPermissions({api,threadId,version,disabled,onAuthError}:{api:Api;threadId:string;version:number;disabled:boolean;onAuthError:(error:unknown)=>void}){
 const [value,setValue]=useState<StandingPermissionState|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pendingAction,setPendingAction]=useState<string|null>(null);
 const alive=useRef(true),lock=useRef(false),pending=useRef<{action:string;path:string;body:unknown}|null>(null),auth=useRef(onAuthError);auth.current=onAuthError;
 const path=`/inbox/${encodeURIComponent(threadId)}`;
 useEffect(()=>{alive.current=true;let current=true;void api<StandingPermissionState>(`${path}/routine-permissions`).then(data=>{if(current)setValue(data);}).catch(e=>{if(current){setValue(null);setError(e instanceof Error?e.message:'Could not load permissions.');auth.current(e);}});return()=>{current=false;alive.current=false;};},[api,path,version]);
 async function act(permission?:StandingPermission){
  const action=permission?.id??'grant';if(lock.current||pending.current&&pending.current.action!==action||!permission&&!value?.preview)return;
  lock.current=true;setBusy(true);setError('');const request=pending.current??{action,path:`${path}/${permission?'revoke-permission':'routine-permissions'}`,body:permission?{permissionId:permission.id,expectedVersion:permission.version,eventKey:Crypto.randomUUID()}:{...value!.preview,eventKey:Crypto.randomUUID()}};pending.current=request;setPendingAction(action);
  try{await api(request.path,request.body);pending.current=null;setPendingAction(null);const next=await api<StandingPermissionState>(`${path}/routine-permissions`);if(alive.current)setValue(next);}
  catch(e){if(e instanceof ApiError&&e.status>=400&&e.status<500){pending.current=null;setPendingAction(null);}if(alive.current){setError(e instanceof Error?e.message:'Permission outcome is uncertain. Retry the same choice.');auth.current(e);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <View style={s.card}><Button secondary label={`${open?'Hide':'Show'} routine follow-ups${value?.permissions.some(p=>p.state==='active')?' · active':''}`} onPress={()=>setOpen(v=>!v)}/>{!!error&&<Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}{open&&value&&<><Text style={s.help}>{value.notice}</Text>{value.permissions.map(permission=><View key={permission.id}><Text style={s.copy}>{permission.title}</Text><Text style={s.help}>{permission.state} · {permission.usedActions} of {permission.maxActions} follow-ups · at most once every {permission.cooldownHours} hours · due in {permission.dueHours} hours · expires {new Date(permission.expiresAt).toLocaleString()}</Text>{permission.state!=='revoked'&&<Button secondary label="Revoke permission" disabled={disabled||busy||!!pendingAction&&pendingAction!==permission.id} onPress={()=>void act(permission)}/>}</View>)}{value.preview&&!value.permissions.some(p=>p.state==='active')&&<><Text style={s.copy}>Task title: {value.preview.title}. Applies to future replies only.</Text><Button label="Allow these follow-ups for 7 days" disabled={disabled||busy||!!pendingAction&&pendingAction!=='grant'} onPress={()=>void act()}/></>}</>}</View>;
}
