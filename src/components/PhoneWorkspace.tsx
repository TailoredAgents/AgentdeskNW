'use client';

import {useEffect, useState, useSyncExternalStore} from 'react';
import {ArrowRight, Bell, Building2, ChevronRight, FileText, LayoutDashboard, ListTodo, Search, Settings2, ShieldCheck, Sparkles, Users} from 'lucide-react';
import type {Role} from '@/lib/contracts';
import {sectionsForRole, type WorkSection} from '@/lib/work-navigation';

const phoneQuery = '(max-width: 800px)';
const subscribe = (notify:()=>void) => {
  const query=window.matchMedia(phoneQuery);
  query.addEventListener('change',notify);
  return ()=>query.removeEventListener('change',notify);
};
export function usePhoneWorkspace() {
  const phone=useSyncExternalStore(subscribe,()=>window.matchMedia(phoneQuery).matches,()=>false);
  useEffect(()=>{
    if(!phone)return;
    const viewport=window.visualViewport;
    const update=()=>{
      document.documentElement.style.setProperty('--phone-height',`${viewport?.height??window.innerHeight}px`);
      document.documentElement.style.setProperty('--phone-top',`${viewport?.offsetTop??0}px`);
    };
    update();
    viewport?.addEventListener('resize',update);
    viewport?.addEventListener('scroll',update);
    window.addEventListener('resize',update);
    return ()=>{
      viewport?.removeEventListener('resize',update);
      viewport?.removeEventListener('scroll',update);
      window.removeEventListener('resize',update);
      document.documentElement.style.removeProperty('--phone-height');
      document.documentElement.style.removeProperty('--phone-top');
    };
  },[phone]);
  return phone;
}

export type PhoneWorkDestination=WorkSection|'dashboard'|'management'|'approvals'|'settings'|'employees'|'billing';
export function PhoneWorkHome({role,name,taskCount,reviewCount,onOpen}:{role:Role;name:string;taskCount:number;reviewCount:number;onOpen:(destination:PhoneWorkDestination)=>void}) {
  const [query,setQuery]=useState('');
  const sections=sectionsForRole(role,query);
  return <section className="phone-work-home">
    <p className="eyebrow">YOUR WORKSPACE</p>
    <h1>Keep things moving.</h1>
    <p className="phone-work-intro">Your next steps, saved work and business records, {name}.</p>
    <div className="phone-work-summary">
      <button onClick={()=>onOpen('tasks')}><ListTodo size={20}/><strong>{taskCount}</strong><span>Your open follow-ups</span><ArrowRight size={16}/></button>
      <button onClick={()=>onOpen('approvals')}><ShieldCheck size={20}/><strong>{reviewCount}</strong><span>CRM changes to review</span><ArrowRight size={16}/></button>
    </div>
    <label className="phone-work-search"><Search size={18}/><input aria-label="Find a work section" placeholder="Find work, records or guidance" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {['Today','Business records','Reference'].map(group=>{
      const entries=sections.filter(item=>item.group===group);
      return entries.length?<section className="phone-work-group" key={group}><h2>{group}</h2><div>{entries.map(item=>{
        const Icon=item.id==='jobs'?Sparkles:item.id==='updates'?Bell:item.id==='tasks'?ListTodo:item.group==='Business records'?Building2:FileText;
        return <button key={item.id} onClick={()=>onOpen(item.id)}><span className="phone-work-icon"><Icon size={20}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={17}/></button>;
      })}</div></section>:null;
    })}
    {!sections.length&&<p role="status" className="phone-work-intro">No matching sections. Try “jobs,” “deals” or “guidance.”</p>}
    {!query.trim()&&<section className="phone-work-group"><h2>Your workspace</h2><div>
      <button onClick={()=>onOpen('dashboard')}><span className="phone-work-icon"><LayoutDashboard size={20}/></span><span><strong>Workspace overview</strong><small>Your role’s priorities and shortcuts</small></span><ChevronRight size={17}/></button>
      {role==='manager'&&<button onClick={()=>onOpen('management')}><span className="phone-work-icon"><Users size={20}/></span><span><strong>Team overview</strong><small>Office workload and shared next steps</small></span><ChevronRight size={17}/></button>}
      <button onClick={()=>onOpen('employees')}><span className="phone-work-icon"><Sparkles size={20}/></span><span><strong>Your AI workforce</strong><small>Explore the specialists available to your role</small></span><ChevronRight size={17}/></button>
      <button onClick={()=>onOpen('billing')}><span className="phone-work-icon"><ShieldCheck size={20}/></span><span><strong>Credits & billing</strong><small>Usage, balance and spending preferences</small></span><ChevronRight size={17}/></button>
      <button onClick={()=>onOpen('settings')}><span className="phone-work-icon"><Settings2 size={20}/></span><span><strong>Settings</strong><small>Your preferences and connections</small></span><ChevronRight size={17}/></button>
    </div></section>}
    <p className="phone-work-footnote">Fictional workspace · The same saved work on phone and desktop.</p>
  </section>;
}
