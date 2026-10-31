'use client';
import {useEffect,useRef,useState} from 'react';
import type {RecordDetail} from '../lib/record-contracts';
import type {RecordTarget,WorkspaceDestination} from '../lib/workspace-links';
import {nativeLink} from '../lib/workspace-links';
import {recordQuestion,recordSections,recordTitle} from '../lib/record-presentation';
import {api,Modal,Spinner} from './ui';
export function RecordDetailPanel({target,onClose,onOpen,onAsk}:{target:RecordTarget;onClose:()=>void;onOpen:(target:WorkspaceDestination)=>void;onAsk:(text:string)=>void}){
 const [detail,setDetail]=useState<RecordDetail|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);const generation=useRef(0);
 useEffect(()=>{const counter=generation;let alive=true;const load=()=>{const ticket=++generation.current;void api<RecordDetail>(`/records/${target.kind}/${encodeURIComponent(target.id)}`).then(value=>{if(alive&&ticket===generation.current){setDetail(value);setError('');}}).catch(e=>{if(alive&&ticket===generation.current){setDetail(null);setError(e instanceof Error?e.message:'This record is unavailable.');}});};load();const timer=setInterval(load,15000);return()=>{alive=false;counter.current++;clearInterval(timer);};},[target.kind,target.id,attempt]);
 return <Modal title={detail?recordTitle(detail):'Current record'} onClose={onClose} wide>{error?<p role="alert" className="error-text">{error}<button className="button secondary" onClick={()=>setAttempt(value=>value+1)}>Try again</button></p>:!detail?<Spinner label="Loading current record"/>:<><p className="panel-description">{detail.record.synthetic?'Fictional workspace. ':''}{detail.notice}</p><div className="form-footer"><button className="button primary" onClick={()=>onAsk(recordQuestion(detail))}>Discuss with Copilot</button><a className="button secondary" href={nativeLink(target)}>Open in installed phone app</a></div>{recordSections(detail).map(section=><section key={section.title} className="record-context-section"><h3>{section.title}</h3>{section.lines.map((line,index)=><p key={index} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{line}</p>)}{section.links?.map(link=><button key={`${link.target.kind}:${link.target.id}`} className="button secondary" onClick={()=>onOpen(link.target)}>{link.title}</button>)}</section>)}</>}</Modal>;
}
