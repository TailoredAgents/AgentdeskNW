'use client';
import {useEffect,useRef,useState} from 'react';
import type {CommunicationAccount,CommunicationDocumentOption,InboxThreadDetail} from '@/lib/communications-contracts';
import {CommunicationComposer,composingAccounts} from '@/lib/communication-composer';
import {api,Modal} from './ui';

import {DocumentAttachmentPicker} from './DocumentAttachmentPicker';

export function InboxComposer({accounts,documentOptions=[],preferred,onClose,onSaved}:{accounts:CommunicationAccount[];documentOptions?:CommunicationDocumentOption[];preferred:string;onClose:()=>void;onSaved:(detail:InboxThreadDetail)=>void}){
 const [availableFiles,setAvailableFiles]=useState(documentOptions),[filesLoading,setFilesLoading]=useState(false),[filesError,setFilesError]=useState(''),filesEpoch=useRef({value:0});
 const [,render]=useState(0),[controller]=useState(()=>new CommunicationComposer(accounts,preferred,payload=>api('/inbox/compose',payload),()=>crypto.randomUUID(),()=>render(n=>n+1),onSaved));
 useEffect(()=>{const lifecycle=filesEpoch.current;controller.activate();return()=>{controller.deactivate();lifecycle.value++;};},[controller]);
 async function refreshFiles(){const epoch=++filesEpoch.current.value;setFilesError('');setFilesLoading(true);try{const files=await api<CommunicationDocumentOption[]>('/inbox/document-options');if(epoch===filesEpoch.current.value)setAvailableFiles(files);}catch(error){if(epoch===filesEpoch.current.value){setAvailableFiles([]);setFilesError(error instanceof Error?error.message:'Could not refresh source files.');}}finally{if(epoch===filesEpoch.current.value)setFilesLoading(false);}}
 const f=controller.fields,sms=controller.account?.channel==='sms';
 const close=()=>{if(controller.close())onClose();};
 return <Modal title="New conversation" onClose={close}><div className="inbox-confirm inbox-compose">
  <p>Save an opening draft in your private inbox. Review every recipient and the exact message before a separate simulated send.</p>
  {(controller.error||filesError)&&<p role="alert" className="error-banner">{controller.error||filesError}</p>}
  <label className="field">From<select aria-label="New message account" disabled={controller.locked} value={f.accountId} onChange={e=>controller.change({accountId:e.target.value})}>{composingAccounts(accounts).map(a=><option key={a.id} value={a.id}>{a.label} · {a.address}{!a.capabilities.simulateSend?' · draft only':''}</option>)}</select></label>
  <p className="muted">{controller.account?.capabilityNotice}</p>
  <label className="field">Recipient name · optional<input aria-label="New recipient name" value={f.name} maxLength={150} disabled={controller.locked} onChange={e=>controller.change({name:e.target.value})}/></label>
  <label className="field">{sms?'To · international phone number':'To · email address'}<input aria-label="New recipient address" type={sms?'tel':'email'} value={f.address} maxLength={254} disabled={controller.locked} onChange={e=>controller.change({address:e.target.value})} placeholder={sms?'+14045550123':'investor@example.com'}/></label>
  {(!sms||!!f.cc||!!f.subject)&&<><label className="field">CC · optional<input aria-label="New message CC" value={f.cc} maxLength={2800} disabled={controller.locked} onChange={e=>controller.change({cc:e.target.value})}/></label><label className="field">Subject<input aria-label="New message subject" value={f.subject} maxLength={240} disabled={controller.locked} onChange={e=>controller.change({subject:e.target.value})}/></label>{sms&&<p>Clear the email subject and CC to save a text.</p>}</>}
  <label className="field">Message<textarea aria-label="New message body" rows={7} value={f.body} maxLength={sms?1600:12000} disabled={controller.locked} onChange={e=>controller.change({body:e.target.value})}/></label>
  {(!sms||f.documents.length>0)&&<DocumentAttachmentPicker options={sms?[]:availableFiles} value={f.documents} disabled={controller.locked} onChange={documents=>controller.change({documents})}/>}
  {!sms&&<button type="button" className="text-link" disabled={controller.locked||filesLoading} onClick={()=>void refreshFiles()}>{filesLoading?'Refreshing files…':'Refresh saved files'}</button>}
  <p className="muted">Fictional accounts · no delivery or charge. Local files stay private in this simulation. Recipient identity is not independently verified.</p>
  {controller.discardReview?<div><p>Discard this unsaved opening draft?</p><button className="button secondary" onClick={()=>controller.stay()}>Keep editing</button><button className="button ghost" onClick={close}>Discard unsaved draft</button></div>:<div><button className="button primary" disabled={controller.busy||!controller.account} onClick={()=>void controller.save()}>{controller.busy?'Saving…':controller.pending?'Retry exact save':'Save opening draft'}</button><button className="button secondary" disabled={controller.locked} onClick={close}>Cancel</button></div>}
 </div></Modal>;
}
