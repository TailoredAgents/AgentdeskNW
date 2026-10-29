'use client';
import { useEffect,useState } from 'react';
import type { ProviderStatus } from '../lib/provider-contracts';
import { api,Badge,Panel,SectionHead,readable } from './ui';
export function ProviderPanel(){
 const [state,setState]=useState<ProviderStatus|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void api<ProviderStatus>('/providers').then(value=>{if(active)setState(value);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load provider status.');});return()=>{active=false;};},[]);
 return <Panel><SectionHead title="Provider verification"/>{error&&<p role="alert">{error}</p>}{!state&&!error&&<p className="small-copy">Reading saved connection status…</p>}{state&&<>
 {(['text','voice','research'] as const).map(key=><div className="setting-row" key={key}><div><strong>{key==='text'?'Natural-language Copilot':key==='voice'?'Two-way voice':'External Investor Hunter'}</strong><p>{state[key].model}</p><p>{state[key].lastSuccessAt?`Provider receipt saved ${new Date(state[key].lastSuccessAt!).toLocaleString()}`:'No successful provider receipt recorded for this employee.'}</p></div><Badge tone={state[key].state==='receipt_recorded'?'green':'amber'}>{readable(state[key].state)}</Badge></div>)}
 <p className="small-copy">Configured credentials do not prove account access or a working conversation. A provider receipt does not verify microphone quality, source claims or production readiness.</p>
 <details className="source-details"><summary>Sources and usage evidence</summary>{Object.values(state.sources).map(value=><p className="small-copy" key={value}>{value}</p>)}<p className="small-copy">Latest {state.usage.operations} provider operations: {state.usage.tokens.toLocaleString()} reported tokens; {state.usage.unresolved} unresolved receipts. Actual provider cost is {state.usage.knownCostOperations?`known for ${state.usage.knownCostOperations} operations`:'not reconciled'}. Research budgets are configured estimates.</p><p className="small-copy">Each text turn allows up to {state.limits.textRounds} model steps and {state.limits.textToolCalls} tool calls. External jobs allow up to {state.limits.researchRequests} provider requests and {state.limits.researchSearchCalls} search calls.</p></details>
 </>}</Panel>;
}
