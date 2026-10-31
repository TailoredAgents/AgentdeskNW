'use client';
import {useEffect,useRef,useState} from 'react';
import type {RolePreparation} from '@/lib/role-preparation-contracts';
import {api,ApiError,Panel,SectionHead} from './ui';

export function RolePreparationsPanel(){
 const [items,setItems]=useState<RolePreparation[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<{id:string;reference:string;decision:'apply'|'dismiss';eventKey:string}|null>(null);
 const alive=useRef(true),reading=useRef(0),mutating=useRef(false);
 function load(){if(mutating.current)return;const epoch=++reading.current;return api<RolePreparation[]>('/role-preparations').then(next=>{if(alive.current&&epoch===reading.current)setItems(next);}).catch(error=>{if(alive.current&&epoch===reading.current){setItems([]);setError(error instanceof Error?error.message:'Prepared work is unavailable.');}});}
 function dispose(){alive.current=false;reading.current++;}
 useEffect(()=>{alive.current=true;void load();const timer=setInterval(()=>void load(),8000);return()=>{dispose();clearInterval(timer);};},[]);
 async function decide(item:Pick<RolePreparation,'id'|'reference'>,decision:'apply'|'dismiss'){
  if(mutating.current)return;mutating.current=true;reading.current++;setBusy(true);setError('');
  const request=pending??{id:item.id,reference:item.reference,decision,eventKey:crypto.randomUUID()};setPending(request);
  try{await api(`/role-preparations/${encodeURIComponent(request.id)}/decision`,{reference:request.reference,decision:request.decision,eventKey:request.eventKey});setPending(null);}
  catch(error){if(error instanceof ApiError&&[400,401,402,403,404,409,422].includes(error.status))setPending(null);if(alive.current)setError(error instanceof Error?error.message:'The result is uncertain. Retry the same decision.');}
  finally{mutating.current=false;if(alive.current){setBusy(false);void load();}}
 }
 const locked=busy||!!pending;
 if(!items.length&&!error)return null;
 return <Panel><SectionHead title="Prepared for your review"/><p className="panel-description">Your Agent has prepared these actions. Review the details before changing the fictional business records.</p>{error&&<p role="alert" className="error-text">{error}</p>}{items.map(item=><div className="relationship-method" key={item.id}><button className="text-link" disabled={locked} onClick={()=>setSelected(selected===item.id?'':item.id)}>{item.title} · {item.state==='pending'?(item.current?'Needs review':'Needs fresh information'):item.state}</button>{selected===item.id&&<><p style={{whiteSpace:'pre-wrap'}}>{item.body}</p><p className="subtle-note">{item.notice}</p>{item.state==='pending'&&<div className="form-footer"><button className="button secondary" disabled={locked} onClick={()=>void decide(item,'dismiss')}>Dismiss</button><button className="button primary" disabled={locked||!item.current} onClick={()=>void decide(item,'apply')}>Apply reviewed action</button></div>}</>}</div>)}{pending&&!busy&&<button className="button secondary" onClick={()=>{if(pending)void decide(pending,pending.decision);}}>Retry same decision</button>}</Panel>;
}
