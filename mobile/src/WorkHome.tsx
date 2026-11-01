import {isRolePreparationArtifact} from '../../src/lib/role-preparation-contracts';
import {destinationFromArtifact,type RecordTarget,type WorkspaceDestination} from '../../src/lib/workspace-links';
import {TransactionsScreen} from './TransactionsScreen';
import {DocumentsScreen} from './DocumentsScreen';
import {KnowledgeScreen} from './KnowledgeScreen';
import {UpdatesScreen} from './UpdatesScreen';
import {AnalysisScreen} from './AnalysisScreen';
import {OpportunitiesScreen} from './OpportunitiesScreen';
import {HandoffsScreen} from './HandoffsScreen';
import {RecordsScreen} from './RecordsScreen';
import {WorkNavigation} from './WorkNavigation';
import type {WorkSection} from './work-navigation';
import {useCallback,useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import type {Artifact,Bootstrap} from '../../src/lib/contracts';
import {createApi} from './client';
import {WorkScreen} from './WorkScreen';
import {AcquisitionScreen} from './AcquisitionScreen';
import {TasksScreen} from './TasksScreen';
import {styles as s} from './styles';
type Props={api:ReturnType<typeof createApi>;bootstrap:Bootstrap;initialDocument?:string|null;initialTeamTransaction?:string|null;initialTransaction?:string|null;initialKnowledge?:string|null;initialUpdate?:string|null;initialJob:string|null;initialTask:string|null;initialHandoffs?:boolean;initialHandoffId?:string|null;initialOpportunity?:string|null;initialAnalysis?:string|null;initialRecord?:RecordTarget|null;onAuthError:(error:unknown)=>void;onGuard:(guard:((leave:()=>void)=>void)|null)=>void;onInbox:(id:string)=>void;onAsk:(text:string)=>void;onFallback:(artifact:Artifact)=>void};
function initialSection(p:Props):WorkSection{return p.initialRecord?'records':p.initialDocument!=null?'documents':p.initialTeamTransaction!=null||p.initialTransaction!=null?'transactions':p.initialKnowledge!=null?'knowledge':p.initialUpdate!=null?'updates':p.initialAnalysis!=null?'analysis':p.initialOpportunity!=null?'opportunities':p.initialHandoffs?'handoffs':p.initialJob!==null?'jobs':'tasks';}
export function WorkHome(props:Props){
 const {api,bootstrap,initialDocument,initialTeamTransaction,initialTransaction,initialKnowledge,initialUpdate,initialJob,initialTask,initialHandoffs,initialHandoffId,initialOpportunity,initialAnalysis,initialRecord,onAuthError,onGuard,onInbox,onAsk,onFallback}=props;
 const [section,setSection]=useState<WorkSection>(()=>initialSection(props)),[target,setTarget]=useState<WorkspaceDestination|null>(null),guard=useRef<((leave:()=>void)=>void)|null>(null);
 const register=useCallback((next:((leave:()=>void)=>void)|null)=>{guard.current=next;onGuard(next);},[onGuard]);
 useEffect(()=>{setTarget(null);setSection(initialSection(props));},[initialDocument,initialTeamTransaction,initialTransaction,initialKnowledge,initialUpdate,initialJob,initialTask,initialHandoffs,initialHandoffId,initialOpportunity,initialAnalysis,initialRecord?.kind,initialRecord?.id]);
 const navigate=(next:()=>void)=>{if(guard.current)guard.current(next);else next();};
 function open(next:WorkspaceDestination){navigate(()=>{if(next.kind==='inbox'){onInbox(next.id);return;}setTarget(next);const map:Record<Exclude<WorkspaceDestination['kind'],'inbox'>,WorkSection>={work:'jobs',updates:'updates',task:'tasks',investor:'records',property:'records',document:'documents',transaction:'transactions',transaction_team:'transactions',analysis:'analysis',opportunity:'opportunities',handoff:'handoffs',knowledge:'knowledge'};setSection(map[next.kind]);});}
 function artifact(value:Artifact){if(isRolePreparationArtifact(value)){navigate(()=>{setTarget(null);setSection('jobs');});return;}const next=destinationFromArtifact(value);if(next)open(next);else if(value.type==='investors'){navigate(()=>{setTarget(null);setSection('records');});}else onFallback(value);}
 const id=(kind:WorkspaceDestination['kind'],initial?:string|null)=>target?.kind===kind?target.id:initial??null;
 const record:RecordTarget|null=target?.kind==='investor'||target?.kind==='property'?{kind:target.kind,id:target.id}:initialRecord??null;
 return <View style={s.grow}><WorkNavigation role={bootstrap.actor.role} section={section} onSelect={next=>navigate(()=>{setTarget(null);setSection(next);})}/>
 {section==='records'?<RecordsScreen api={api} initialTarget={record?.id?record:null} onAuthError={onAuthError} onOpen={open} onAsk={onAsk}/>:
 section==='transactions'?<TransactionsScreen key={`${target?.kind??'initial'}:${target?.id??''}:${initialTeamTransaction??'private'}:${initialTransaction??''}`} initialTeamId={target?.kind==='transaction'?null:id('transaction_team',initialTeamTransaction)} initialId={id('transaction',initialTransaction)} api={api} onGuard={register} onInbox={onInbox}/>:
 section==='documents'?<DocumentsScreen key={id('document',initialDocument)??'library'} initialId={id('document',initialDocument)??undefined} api={api} onGuard={register}/>:
 section==='knowledge'?<KnowledgeScreen initialId={id('knowledge',initialKnowledge)} api={api} onAuthError={onAuthError} onGuard={register}/>:
 section==='updates'?<UpdatesScreen initialId={id('updates',initialUpdate)} api={api} onAuthError={onAuthError} onGuard={register} onOpen={artifact}/>:
 section==='analysis'?<AnalysisScreen key={id('analysis',initialAnalysis)??'board'} api={api} initialId={id('analysis',initialAnalysis)} onAuthError={onAuthError} onGuard={register}/>:
 section==='tasks'?<TasksScreen api={api} initialId={id('task',initialTask)} onAuthError={onAuthError} onGuard={register} onInbox={onInbox} onRecord={open}/>:
 section==='handoffs'?<HandoffsScreen onOpenOpportunity={value=>open({kind:'opportunity',id:value})} key={id('handoff',initialHandoffId)??'board'} initialId={id('handoff',initialHandoffId)} api={api} onAuthError={onAuthError} onGuard={register}/>:
 section==='opportunities'?<OpportunitiesScreen onAsk={text=>navigate(()=>onAsk(text))} onOpenHandoff={value=>open({kind:'handoff',id:value})} key={id('opportunity',initialOpportunity)??'board'} onOpenAnalysis={value=>open({kind:'analysis',id:value})} api={api} initialId={id('opportunity',initialOpportunity)} onAuthError={onAuthError} onGuard={register}/>:
 section==='intake'?<AcquisitionScreen api={api} bootstrap={bootstrap} onAuthError={onAuthError} onGuard={register}/>:
 <WorkScreen onArtifact={artifact} onRecord={open} api={api} bootstrap={bootstrap} initialId={id('work',initialJob)||null} onAuthError={onAuthError} onGuard={register}/>}</View>;
}
