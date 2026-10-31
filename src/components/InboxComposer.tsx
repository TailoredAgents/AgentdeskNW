'use client';
import {useEffect,useState} from 'react';
import type {CommunicationAccount,InboxThreadDetail} from '@/lib/communications-contracts';
import {CommunicationComposer,composingAccounts} from '@/lib/communication-composer';
import {api,Modal} from './ui';

export function InboxComposer({accounts,preferred,onClose,onSaved}:{accounts:CommunicationAccount[];preferred:string;onClose:()=>void;onSaved:(detail:InboxThreadDetail)=>void}){
 const [,render]=useState(0),[controller]=useState(()=>new CommunicationComposer(accounts,preferred,payload=>api('/inbox/compose',payload),()=>crypto.randomUUID(),()=>render(n=>n+1),onSaved));
 useEffect(()=>{controller.activate();return()=>controller.deactivate();},[controller]);
 const f=controller.fields,sms=controller.account?.channel==='sms';
 const close=()=>{if(controller.close())onClose();};
 return <Modal title="New conversation" onClose={close}><div className="inbox-confirm inbox-compose">
  <p>Save an opening draft in your private inbox. Review every recipient and the exact message before a separate simulated send.</p>
  {controller.error&&<p role="alert" className="error-banner">{controller.error}</p>}
  <label className="field">From<select aria-label="New message account" disabled={controller.locked} value={f.accountId} onChange={e=>controller.change({accountId:e.target.value})}>{composingAccounts(accounts).map(a=><option key={a.id} value={a.id}>{a.label} · {a.address}{!a.capabilities.simulateSend?' · draft only':''}</option>)}</select></label>
  <p className="muted">{controller.account?.capabilityNotice}</p>
  <label className="field">Recipient name · optional<input aria-label="New recipient name" value={f.name} maxLength={150} disabled={controller.locked} onChange={e=>controller.change({name:e.target.value})}/></label>
  <label className="field">{sms?'To · international phone number':'To · email address'}<input aria-label="New recipient address" type={sms?'tel':'email'} value={f.address} maxLength={254} disabled={controller.locked} onChange={e=>controller.change({address:e.target.value})} placeholder={sms?'+14045550123':'investor@example.com'}/></label>
  {(!sms||!!f.cc||!!f.subject)&&<><label className="field">CC · optional<input aria-label="New message CC" value={f.cc} maxLength={2800} disabled={controller.locked} onChange={e=>controller.change({cc:e.target.value})}/></label><label className="field">Subject<input aria-label="New message subject" value={f.subject} maxLength={240} disabled={controller.locked} onChange={e=>controller.change({subject:e.target.value})}/></label>{sms&&<p>Clear the email subject and CC to save a text.</p>}</>}
  <label className="field">Message<textarea aria-label="New message body" rows={7} value={f.body} maxLength={sms?1600:12000} disabled={controller.locked} onChange={e=>controller.change({body:e.target.value})}/></label>
  <p className="muted">Fictional accounts · no delivery or charge. No attachments. Recipient identity is not independently verified.</p>
  {controller.discardReview?<div><p>Discard this unsaved opening draft?</p><button className="button secondary" onClick={()=>controller.stay()}>Keep editing</button><button className="button ghost" onClick={close}>Discard unsaved draft</button></div>:<div><button className="button primary" disabled={controller.busy||!controller.account} onClick={()=>void controller.save()}>{controller.busy?'Saving…':controller.pending?'Retry exact save':'Save opening draft'}</button><button className="button secondary" disabled={controller.locked} onClick={close}>Cancel</button></div>}
 </div></Modal>;
}
