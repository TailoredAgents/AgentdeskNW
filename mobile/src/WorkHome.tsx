import {useCallback,useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import type {Bootstrap} from '../../src/lib/contracts';
import {createApi} from './client';
import {Button,WorkScreen} from './WorkScreen';
import {AcquisitionScreen} from './AcquisitionScreen';
import {TasksScreen} from './TasksScreen';
import {styles as s} from './styles';
export function WorkHome({api,bootstrap,initialJob,initialTask,onAuthError,onGuard,onInbox}:{api:ReturnType<typeof createApi>;bootstrap:Bootstrap;initialJob:string|null;initialTask:string|null;onAuthError:(error:unknown)=>void;onGuard:(guard:((leave:()=>void)=>void)|null)=>void;onInbox:(id:string)=>void}){
 const [section,setSection]=useState<'tasks'|'jobs'|'intake'>(initialJob?'jobs':'tasks'),guard=useRef<((leave:()=>void)=>void)|null>(null);
 const register=useCallback((next:((leave:()=>void)=>void)|null)=>{guard.current=next;onGuard(next);},[onGuard]);
 useEffect(()=>{setSection(initialJob?'jobs':'tasks');},[initialJob,initialTask]);
 return <View style={s.grow}><View style={[s.wrap,{paddingHorizontal:20,paddingTop:12}]}>{(['tasks','jobs',...(bootstrap.actor.role!=='dispositions'?['intake' as const]:[])] as const).map(value=><Button key={value} label={value==='tasks'?'My follow-ups':value==='jobs'?'Copilot jobs':'Intake'} secondary={section!==value} onPress={()=>{const change=()=>setSection(value);if(guard.current)guard.current(change);else change();}}/>)}</View>{section==='tasks'?<TasksScreen api={api} initialId={initialTask} onAuthError={onAuthError} onGuard={register} onInbox={onInbox}/>:section==='intake'?<AcquisitionScreen api={api} bootstrap={bootstrap} onAuthError={onAuthError} onGuard={register}/>:<WorkScreen api={api} bootstrap={bootstrap} initialId={initialJob} onAuthError={onAuthError}/>}</View>;
}
