'use client';

import {Building2,Check,ChevronDown,Inbox,Mail,MessageSquare,ShieldCheck} from 'lucide-react';
import type {CommunicationAccount,InboxThreadDetail} from '@/lib/communications-contracts';
import {Badge} from './ui';

export function AccountIcon({account,size=17}:{account:CommunicationAccount;size?:number}){
 return account.source.system==='salesforce'?<Building2 size={size}/>:account.channel==='sms'?<MessageSquare size={size}/>:<Mail size={size}/>;
}

export function InboxAccounts({accounts,selectedId,expanded,busy,onExpand,onSelect}:{accounts:CommunicationAccount[];selectedId:string;expanded:boolean;busy:boolean;onExpand:()=>void;onSelect:(id:string)=>void}){
 const primary=accounts.find(account=>account.primary),others=accounts.filter(account=>!account.primary),selected=accounts.find(account=>account.id===selectedId);
 const card=(account:CommunicationAccount)=><button key={account.id} className={selectedId===account.id?'active':''} disabled={busy} aria-pressed={selectedId===account.id} onClick={()=>onSelect(account.id)}><span className={`inbox-account-icon provider-${account.provider}`}><AccountIcon account={account}/></span><span><strong>{account.label}</strong><small>{account.primary?'Salesforce workflow · fictional company email':account.source.coverage==='crm_activity'?'Activity record · read only':account.source.coverage==='headers_only'?'Message details · body unavailable':account.address}</small></span><Badge tone={account.access==='revoked'?'amber':'neutral'}>{account.access==='revoked'?'Access paused':account.primary?'Primary demo':'Demo'}</Badge></button>;
 return <section className="inbox-account-picker" aria-label="Demonstration accounts">
  <div className="inbox-account-strip inbox-primary-account">{primary&&card(primary)}<div className="inbox-account-options"><span>{selected&&!selected.primary?`Viewing ${selected.label}`:!selectedId?'Viewing all demonstration accounts':'Your company workflow, in one place'}</span><button className="text-link" aria-expanded={expanded} aria-controls="inbox-other-accounts" disabled={busy} onClick={onExpand}>{expanded?'Hide other inboxes':`Other inboxes & source examples (${others.length})`}<ChevronDown size={14}/></button></div></div>
  {expanded&&<div className="inbox-other-accounts" id="inbox-other-accounts"><div className="inbox-account-strip">{others.map(card)}<button className={!selectedId?'active':''} disabled={busy} aria-pressed={!selectedId} onClick={()=>onSelect('')}><span className="inbox-account-icon"><Inbox size={17}/></span><span><strong>All demonstration accounts</strong><small>Company email, optional email and investor texts</small></span></button></div><p>Gmail, Outlook and investor texts are optional demonstrations. The source examples show how limited access changes what AgentDesk can do.</p></div>}
 </section>;
}

export function InboxSourceCapabilities({detail}:{detail:InboxThreadDetail}){
 const {account}=detail,readable=account.capabilities.readBody,revoked=account.access==='revoked';
 const label=revoked?'Access paused':account.source.coverage==='crm_activity'?'Activity record only':account.source.coverage==='headers_only'?'Message details only':'Conversation available';
 const items=[['Message content',readable?'Available':revoked?'Hidden while access is paused':'Unavailable'],['Conversation history',account.capabilities.threadHistory?'Available':'Not available from this source'],['Reply simulation',account.capabilities.simulateSend?'Review required · demo only':'Unavailable from this source']];
 return <section className={`inbox-source-capabilities ${!readable?'limited':''}`} aria-label="Source access and capabilities"><div className="inbox-source-heading"><span><ShieldCheck size={15}/><strong>{account.source.label}</strong></span><Badge tone={readable?'neutral':'amber'}>{label}</Badge></div><p>{detail.capabilityNotice}</p><dl>{items.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value==='Available'?<Check size={12}/>:null}{value}</dd></div>)}</dl><small>Fictional source · No live connection · Mailbox attachment retrieval is unavailable{account.capabilities.localTextAttachments?' · Saved local text files can be added to email drafts':''}</small></section>;
}
