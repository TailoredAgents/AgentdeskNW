'use client';
import {useEffect,useRef,useState} from 'react';
import type {CommunicationAccount,InboxThreadDetail} from '@/lib/communications-contracts';
import {api,Spinner} from './ui';

export function PackageInboxPreparation({packageId,onInbox}:{packageId:string;onInbox:(id:string)=>void}){
 const [prep,setPrep]=useState<{reference:string;eligible:boolean;accounts:CommunicationAccount[]}|null>(null),[accountId,setAccountId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[hasAttempt,setHasAttempt]=useState(false);
 const attempt=useRef<{accountId:string;reference:string;eventKey:string}|null>(null);
 useEffect(()=>{let active=true;void api<NonNullable<typeof prep>>(`/packages/${encodeURIComponent(packageId)}/inbox-preparation`).then(value=>{if(active){setPrep(value);setAccountId(value.accounts.find(account=>account.primary)?.id??value.accounts[0]?.id??'');}}).catch(error=>{if(active)setError(error instanceof Error?error.message:'Unable to prepare correspondence.');});return()=>{active=false;};},[packageId]);
 const prepare=async()=>{
  if(!prep||!accountId||busy)return;setBusy(true);setError('');
  setHasAttempt(true);attempt.current??={accountId,reference:prep.reference,eventKey:crypto.randomUUID()};
  try{const detail=await api<InboxThreadDetail>(`/packages/${encodeURIComponent(packageId)}/inbox-preparation`,attempt.current);onInbox(detail.thread.id);}
  catch(error){setError(error instanceof Error?error.message:'The save could not be confirmed. Retry to check the same preparation.');}
  finally{setBusy(false);}
 };
 return <div className="handoff-status"><div><strong>Continue in your Inbox</strong><p>Save a private draft to review and simulate sending. Nothing is delivered externally.</p>{prep&&<label>Sending account<select value={accountId} disabled={busy||hasAttempt} onChange={event=>setAccountId(event.target.value)}>{prep.accounts.map(account=><option value={account.id} key={account.id}>{account.label}</option>)}</select></label>}<button className="button secondary" disabled={busy||!prep?.eligible||!accountId} onClick={()=>void prepare()}>{busy?<Spinner/>:'Prepare Inbox draft'}</button>{prep&&!prep.accounts.length&&<p>No available account matches this package. Choose an email or SMS package.</p>}{error&&<p role="alert">{error}</p>}</div></div>;
}
