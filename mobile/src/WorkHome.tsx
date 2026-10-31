import {AnalysisScreen} from './AnalysisScreen';
import {OpportunitiesScreen} from './OpportunitiesScreen';
import {HandoffsScreen} from './HandoffsScreen';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ScrollView,View} from 'react-native';
import type {Bootstrap} from '../../src/lib/contracts';
import {createApi} from './client';
import {Button,WorkScreen} from './WorkScreen';
import {AcquisitionScreen} from './AcquisitionScreen';
import {TasksScreen} from './TasksScreen';
import {styles as s} from './styles';
export function WorkHome({api,bootstrap,initialJob,initialTask,initialHandoffs,initialOpportunity,initialAnalysis,onAuthError,onGuard,onInbox}:{api:ReturnType<typeof createApi>;bootstrap:Bootstrap;initialJob:string|null;initialTask:string|null;initialHandoffs?:boolean;initialOpportunity?:string|null;initialAnalysis?:string|null;onAuthError:(error:unknown)=>void;onGuard:(guard:((leave:()=>void)=>void)|null)=>void;onInbox:(id:string)=>void}){
 const [section,setSection]=useState<'tasks'|'jobs'|'intake'|'handoffs'|'opportunities'|'analysis'>(initialAnalysis!==null&&initialAnalysis!==undefined?'analysis':initialOpportunity!==null&&initialOpportunity!==undefined?'opportunities':initialHandoffs?'handoffs':initialJob?'jobs':'tasks'),guard=useRef<((leave:()=>void)=>void)|null>(null);
 const register=useCallback((next:((leave:()=>void)=>void)|null)=>{guard.current=next;onGuard(next);},[onGuard]);
 useEffect(()=>{setSection(initialAnalysis!==null&&initialAnalysis!==undefined?'analysis':initialOpportunity!==null&&initialOpportunity!==undefined?'opportunities':initialHandoffs?'handoffs':initialJob?'jobs':'tasks');},[initialJob,initialTask,initialHandoffs,initialOpportunity,initialAnalysis]);
 return <View style={s.grow}><ScrollView horizontal style={{flexGrow:0,flexShrink:0}} contentContainerStyle={{gap:8,paddingHorizontal:20,paddingVertical:12}}>{(['tasks','jobs','analysis','handoffs',...(bootstrap.actor.role!=='dispositions'?['opportunities' as const,'intake' as const]:[])] as const).map(value=><Button key={value} label={value==='analysis'?'Deal analysis':value==='tasks'?'My follow-ups':value==='jobs'?'Copilot jobs':value==='handoffs'?'Handoffs':value==='opportunities'?'New opportunities':'Inventory intake'} secondary={section!==value} onPress={()=>{const change=()=>setSection(value);if(guard.current)guard.current(change);else change();}}/>)}</ScrollView>{section==='analysis'?<AnalysisScreen api={api} initialId={initialAnalysis||null} onAuthError={onAuthError} onGuard={register}/>:section==='tasks'?<TasksScreen api={api} initialId={initialTask} onAuthError={onAuthError} onGuard={register} onInbox={onInbox}/>:section==='handoffs'?<HandoffsScreen api={api} onAuthError={onAuthError} onGuard={register}/>:section==='opportunities'?<OpportunitiesScreen api={api} initialId={initialOpportunity||null} onAuthError={onAuthError} onGuard={register}/>:section==='intake'?<AcquisitionScreen api={api} bootstrap={bootstrap} onAuthError={onAuthError} onGuard={register}/>:<WorkScreen api={api} bootstrap={bootstrap} initialId={initialJob} onAuthError={onAuthError} onGuard={register}/>}</View>;
}
