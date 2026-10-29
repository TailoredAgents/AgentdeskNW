'use client';
import { useState } from 'react';
import { ArrowRight, Building2, Check, Sparkles } from 'lucide-react';
import { api, Spinner } from './ui';

export function DemoAccess({ onEnter }: { onEnter: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="demo-entrance">
    <section className="entrance-story">
      <div className="entrance-brand"><Sparkles size={28}/><span>agentdesk.<small className="brand-edition">NW</small></span></div>
      <div><p className="eyebrow">A TAILORED AGENTS CONCEPT</p><h1>Your next great deal<br/>starts with a clearer day.</h1><p>Meet the AI workforce built around the people who move real estate forward.</p><div className="entrance-points"><span><Check size={18}/>Know who to call next</span><span><Check size={18}/>Turn every conversation into progress</span><span><Check size={18}/>Keep your team one step ahead</span></div></div>
      <span className="entrance-footer">Prepared for New Western · Fictional demonstration workspace</span>
    </section>
    <section className="entrance-form"><div className="entrance-form-inner"><div className="entrance-icon"><Building2 size={26}/></div><p className="eyebrow">WELCOME TO AGENTDESK</p><h2>A better way to work.</h2><p>Enter your invitation code to explore the Georgia demonstration workspace.</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api('/access', {code}); await onEnter(); } catch(e) {setError(e instanceof Error ? e.message : 'Please try again.');} finally {setBusy(false);} }}><label>Invitation code<input type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="current-password" maxLength={256} required autoFocus placeholder="Your private access code"/></label>{error&&<p className="error-text" role="alert">{error}</p>}<button className="button primary full-width" disabled={busy||!code.trim()}>{busy?<Spinner label="Opening your workspace"/>:<>Explore the workspace<ArrowRight size={17}/></>}</button></form><p className="entrance-note">A working product demonstration with sample investors, properties, and connected workflows.</p></div></section>
  </main>;
}
