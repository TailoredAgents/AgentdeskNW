'use client';
import { useCallback,useEffect,useState } from 'react';
import { BrainCircuit,Check,RotateCcw,Save } from 'lucide-react';
import type { EmployeeMemory } from '@/lib/memory-contracts';
import { api,Badge,Panel,SectionHead,Spinner } from './ui';

type MemoryEditor={tone:''|'direct'|'warm';length:''|'concise'|'detailed';avoidPhrases:string;priorities:string};
const emptyEditor:MemoryEditor={tone:'',length:'',avoidPhrases:'',priorities:''};
const toEditor=(memory:EmployeeMemory):MemoryEditor=>({tone:memory.tone??'',length:memory.length??'',avoidPhrases:memory.avoidPhrases.join('\n'),priorities:memory.priorities.join('\n')});
const lines=(text:string)=>[...new Set(text.split('\n').map(value=>value.trim()).filter(Boolean))];
const savedDate=(value:string)=>new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const sourceLabels={tone:'Tone',length:'Detail',avoidPhrases:'Phrases to avoid',priorities:'Priorities'};

export function MemoryPanel({onChange}:{onChange?:()=>Promise<void>}){
 const [memory,setMemory]=useState<EmployeeMemory|null>(null),[editor,setEditor]=useState<MemoryEditor>(emptyEditor),[undoMemory,setUndoMemory]=useState<EmployeeMemory|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');setUndoMemory(null);try{const next=await api<EmployeeMemory>('/memory');setMemory(next);setEditor(toEditor(next));}catch(e){setError(e instanceof Error?e.message:'Could not load your saved preferences.');}finally{setLoading(false);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const hasMemory=!!memory&&(!!memory.tone||!!memory.length||memory.avoidPhrases.length>0||memory.priorities.length>0);
 const dirty=!!memory&&JSON.stringify(editor)!==JSON.stringify(toEditor(memory));
 async function save(){
  if(!memory)return;
  const avoidPhrases=lines(editor.avoidPhrases),priorities=lines(editor.priorities);
  if(avoidPhrases.length>8||priorities.length>8){setError('Keep each list to eight items so Copilot can focus on what matters.');return;}
  if(avoidPhrases.some(value=>value.length>80)||priorities.some(value=>value.length>160)){setError('Use up to 80 characters per phrase and 160 characters per priority.');return;}
  setBusy(true);setError('');setNotice('');
  try{const next=await api<EmployeeMemory>('/memory',{tone:editor.tone||null,length:editor.length||null,avoidPhrases,priorities,sourceText:'Edited in memory settings',expectedVersion:memory.version},'PATCH');setMemory(next);setEditor(toEditor(next));setUndoMemory(null);setNotice('Saved. Copilot will use these preferences in future replies.');await onChange?.();}
  catch(e){setError(e instanceof Error?e.message:'Could not save your preferences.');}finally{setBusy(false);}
 }
 async function forget(){
  if(!memory)return;setBusy(true);setError('');setNotice('');
  try{const next=await api<EmployeeMemory>('/memory',{expectedVersion:memory.version},'DELETE');setUndoMemory(memory);setMemory(next);setEditor(toEditor(next));setNotice('Saved preferences cleared. Future replies will use the defaults.');await onChange?.();}
  catch(e){setError(e instanceof Error?e.message:'Could not clear your saved preferences.');}finally{setBusy(false);}
 }
 async function restore(){
  if(!memory||!undoMemory)return;setBusy(true);setError('');
  try{const next=await api<EmployeeMemory>('/memory',{tone:undoMemory.tone,length:undoMemory.length,avoidPhrases:undoMemory.avoidPhrases,priorities:undoMemory.priorities,sourceText:'Restored after clearing memory settings',expectedVersion:memory.version},'PATCH');setMemory(next);setEditor(toEditor(next));setUndoMemory(null);setNotice('Your previous preferences have been restored.');await onChange?.();}
  catch(e){setError(e instanceof Error?e.message:'Could not restore your preferences.');}finally{setBusy(false);}
 }
 return <Panel className="employee-memory"><SectionHead title="Your Copilot memory" aside={<BrainCircuit size={21}/>}/>
  <p className="panel-description">Tell Copilot how you like to work. These preferences carry into future conversations, and you can change them here.</p>
  {error&&<div className="intelligence-message intelligence-message-error" role="alert"><p>{error}</p><button className="text-link" disabled={busy||loading} onClick={()=>void load()}>Reload preferences</button></div>}
  {notice&&<div className="intelligence-message intelligence-message-success" role="status"><Check size={16}/><span>{notice}{undoMemory&&<button type="button" className="text-link memory-undo" disabled={busy} onClick={()=>void restore()}>Undo</button>}</span></div>}
  {loading?<div className="intelligence-loading"><Spinner label="Loading your memory"/></div>:memory&&<>
   <div className="memory-state"><Badge tone={hasMemory?'green':'neutral'}>{hasMemory?'Preferences saved':'No preferences saved yet'}</Badge>{memory.updatedAt&&<span>Updated {savedDate(memory.updatedAt)}</span>}</div>
   <form className="memory-form" onSubmit={e=>{e.preventDefault();void save();}}>
    <fieldset disabled={busy}><legend className="visually-hidden">Your writing and work preferences</legend>
     <div className="memory-style-grid"><label>Writing tone<select value={editor.tone} onChange={e=>setEditor({...editor,tone:e.target.value as MemoryEditor['tone']})}><option value="">No preference</option><option value="direct">Direct and straightforward</option><option value="warm">Warm and conversational</option></select></label><label>Level of detail<select value={editor.length} onChange={e=>setEditor({...editor,length:e.target.value as MemoryEditor['length']})}><option value="">No preference</option><option value="concise">Keep it concise</option><option value="detailed">Include more detail</option></select></label></div>
     <label>Phrases to leave out<textarea value={editor.avoidPhrases} onChange={e=>setEditor({...editor,avoidPhrases:e.target.value})} placeholder={'Exciting opportunity\nJust checking in'} rows={3} maxLength={720}/><span className="memory-field-help">One phrase per line · up to eight phrases</span></label>
     <label>Current work priorities<textarea value={editor.priorities} onChange={e=>setEditor({...editor,priorities:e.target.value})} placeholder={'Resolve open questions before sending a new property\nFollow through on promised callbacks'} rows={3} maxLength={1360}/><span className="memory-field-help">One priority per line · up to eight priorities</span></label>
    </fieldset>
    <div className="memory-actions"><button className="button primary" disabled={busy||!dirty}>{busy?<Spinner label="Saving"/>:<><Save size={15}/>Save preferences</>}</button><button type="button" className="button ghost small" disabled={busy||!hasMemory} onClick={()=>void forget()}><RotateCcw size={14}/>Forget saved preferences</button></div>
   </form>
   <div className="memory-conversation-tip"><BrainCircuit size={17}/><div><strong>You can also tell Copilot directly</strong><p>“Remember: keep my messages short and direct.”</p><span>Copilot saves supported preferences when you state a preference directly. You can inspect the result here.</span></div></div>
   {!!Object.keys(memory.sources).length&&<details className="memory-sources"><summary>Where these preferences came from</summary><div>{Object.entries(memory.sources).map(([key,source])=>source&&<div key={key}><strong>{sourceLabels[key as keyof typeof sourceLabels]}</strong><p>{source.text}</p><span>{savedDate(source.updatedAt)}</span></div>)}</div></details>}
  </>}
 </Panel>;
}
