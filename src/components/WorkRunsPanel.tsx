'use client';

import {RolePreparationsPanel} from './RolePreparationsPanel';
import {includedLocalWorkNotice} from '@/lib/work-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CirclePause, Clock, FileText, Info, Play, Plus, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Artifact, Bootstrap } from '@/lib/contracts';
import type { WorkRun, WorkRunStatus, WorkStep } from '@/lib/work-contracts';
import {WorkQuestionPanel} from './WorkQuestionPanel';
import {AssignmentReviewsPanel} from './AssignmentReviewsPanel';
import {HandoffsPanel} from './HandoffsPanel';
import {AnalysisPanel} from './AnalysisPanel';
import {OpportunitiesPanel} from './OpportunitiesPanel';
import {AcquisitionIntakePanel} from './AcquisitionIntakePanel';
import { api, ApiError, Badge, EmptyState, Modal, Panel, readable, SectionHead, Spinner } from './ui';

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const statusLabels: Record<WorkRunStatus, string> = {
  queued: 'Ready to start', running: 'In progress', waiting_cost_approval: 'Needs cost approval',
  waiting_for_input: 'Needs your attention', waiting_for_dependency: 'Waiting for a result',
  paused: 'Paused', reconciling: 'Outcome needs review', completed: 'Completed', failed: 'Stopped', canceled: 'Canceled',
};
const statusTone = (status: WorkRunStatus): 'green' | 'amber' | 'cyan' | 'neutral' | 'red' => status === 'completed' ? 'green' : ['waiting_cost_approval', 'waiting_for_input', 'reconciling'].includes(status) ? 'amber' : ['queued', 'running', 'waiting_for_dependency'].includes(status) ? 'cyan' : status === 'failed' ? 'red' : 'neutral';
const capabilityLabels: Record<string, string> = {
  review_source_document:'Review private source document',review_team_transaction:'Review shared transaction work',review_transaction:'Review private transaction',prepare_title_email:'Prepare title Inbox draft',
  review_investment_analysis:'Review investment scenario',review_diligence_analysis:'Review diligence scenario',review_opportunity: 'Review wholesaler opportunity',
  request_information: 'Ask for missing information',
  inspect_property: 'Read property facts', match_existing_buyers: 'Find existing buyers',
  relationship_next_step: 'Prepare the relationship next step', review_handoff: 'Review the acquisition handoff',
  office_priorities: 'Prepare office priorities', create_followup: 'Save the requested follow-up',
  start_synthetic_research: 'Start fictional investor research', await_synthetic_research: 'Collect fictional research results',
};
const stepName = (name: string) => capabilityLabels[name] ?? readable(name.replaceAll('-', ' '));
const moment = (value: string) => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const presets = {
  dispositions: { id: 'dispositions', title: 'Prepare an investor follow-up', description: 'Review a sample property, match existing buyers, optionally check a selected investor’s context, and save a personal follow-up task.' },
  acquisitions: { id: 'acquisitions', title: 'Review a property handoff', description: 'Review a sample property and its available release details, identify missing handoff facts, and save a personal follow-up task.' },
  manager: { id: 'management', title: 'Review office priorities', description: 'Summarize the permitted sample office workload and save a personal follow-up for the next review.' },
} as const;

type Props = {
  data: Bootstrap;
  initialRunId?: string;
  initialAnalysisId?: string;initialOpportunityId?:string;initialHandoffId?:string;
  onChange: (message?: string) => Promise<void>;
  onError: (error: unknown) => void;
  onArtifact?: (artifact: Artifact) => void;
  onAsk?: (text:string)=>void;
};
type PendingRequest = { signature: string; key: string };

/** Show the actual saved inputs rather than trusting the plan's descriptive title. */
function WorkStepScope({ step, steps, data }: { step: WorkStep; steps: WorkStep[]; data: Bootstrap }) {
  const resolve = (value: unknown, seen = new Set<string>()): { value: unknown; reference?: string } => {
    if (!value || typeof value !== 'object' || !('$step' in value) || !('path' in value)) return { value };
    const reference = value as { $step: string; path: string };
    const source = steps.find(candidate => candidate.key === reference.$step);
    const label = source ? `Result from “${stepName(source.capabilityId)}”` : 'A prior step’s result';
    if (!source || seen.has(source.key)) return { value: undefined, reference: label };
    const visited = new Set([...seen, source.key]);
    let resolved: unknown = source.result?.data;
    for (const part of String(reference.path).split('.').slice(0, 16)) {
      if (!resolved || typeof resolved !== 'object' || ['__proto__', 'constructor', 'prototype'].includes(part) || !Object.hasOwn(resolved, part)) { resolved = undefined; break; }
      resolved = (resolved as Record<string, unknown>)[part];
    }
    if (resolved !== undefined) return { value: resolved };
    if (reference.path === 'propertyId' || reference.path === 'investorId') {
      const known = (source.resolvedInput ?? source.input)[reference.path];
      if (known !== undefined) return resolve(known, visited);
    }
    return { value: undefined, reference: label };
  };
  const input = step.resolvedInput ?? step.input;
  const rows: { label: string; value: string }[] = [];
  const target = (field: string, label: string, name: (id: string) => string | undefined) => {
    if (!(field in input)) return;
    const result = resolve(input[field]);
    if (result.reference) rows.push({ label, value: result.reference });
    else if (typeof result.value === 'string') rows.push({ label, value: name(result.value) ?? `Selected record ${result.value}` });
    else if (result.value === null && field === 'investorId' && step.capabilityId === 'create_followup') rows.push({ label, value: 'Personal task; no investor linked' });
  };
  target('propertyId', 'Property', id => { const property = data.properties.find(item => item.id === id); return property ? `${property.address} · ${property.city}` : undefined; });
  target('investorId', 'Investor', id => { const investor = data.investors.find(item => item.id === id); return investor ? `${investor.name} · ${investor.company}` : undefined; });
  if ('title' in input) {const title=resolve(input.title);rows.push({label:'Task',value:title.reference??String(title.value)});}
  if ('dueAt' in input) {const due=resolve(input.dueAt);rows.push({label:'Due',value:due.reference??(typeof due.value==='string'?moment(due.value):'No due date')});}
  if (typeof input.limit === 'number') rows.push({ label: 'Research', value: `Up to ${input.limit} fictional prospects` });
  if ('jobId' in input) {
    const result = resolve(input.jobId);
    rows.push({ label: 'Research job', value: result.reference ?? (typeof result.value === 'string' ? `Saved child job ${result.value}` : 'The child research job from this plan') });
  }
  if (step.capabilityId === 'office_priorities') rows.push({ label: 'Scope', value: 'Permitted office workload; no private messages' });
  return rows.length ? <dl className="work-step-scope">{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : null;
}

export function WorkRunsPanel({ data, initialRunId, initialAnalysisId, initialOpportunityId, initialHandoffId, onChange, onError, onArtifact, onAsk }: Props) {
  const [runs, setRuns] = useState<WorkRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialRunId);
  const [detail, setDetail] = useState<WorkRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<WorkRun | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [propertyId, setPropertyId] = useState(data.properties[0]?.id ?? '');
  const [investorId, setInvestorId] = useState(data.investors[0]?.id ?? '');
  const [includeResearch, setIncludeResearch] = useState(false);
  const alive = useRef(false);
  const loadingVersion = useRef(0);
  const mutating = useRef(false);
  const pending = useRef<PendingRequest | null>(null);
  const errorHandler = useRef(onError);
  const changeHandler = useRef(onChange);
  const preset = presets[data.actor.role];

  useEffect(() => { errorHandler.current = onError; changeHandler.current = onChange; }, [onError, onChange]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (mutating.current) return;
    const version = ++loadingVersion.current;
    try {
      const [listResult, selectedResult] = await Promise.allSettled([
        api<{ runs: WorkRun[] }>('/work'),
        selectedId ? api<WorkRun>(`/work/${encodeURIComponent(selectedId)}`) : Promise.resolve(null),
      ]);
      if (!alive.current || version !== loadingVersion.current) return;
      if (listResult.status === 'rejected') throw listResult.reason;
      const list = listResult.value;
      setRuns(list.runs);
      if (selectedResult.status === 'rejected') {
        setDetail(null); setReview(null);
        setError(selectedResult.reason instanceof Error ? selectedResult.reason.message : 'This job is no longer available. Choose another saved job.');
        return;
      }
      const selected = selectedResult.value;
      setDetail(selected ?? list.runs[0] ?? null);
      if (selected?.contentRestricted) setReview(null);
      if (!selectedId && list.runs[0]) setSelectedId(list.runs[0].id);
      setError('');
    } catch (failure) {
      if (!alive.current || version !== loadingVersion.current) return;
      setRuns([]);
      setDetail(null);
      setError(failure instanceof Error ? failure.message : 'Could not load your saved work.');
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) setReview(null);
    } finally {
      if (alive.current && version === loadingVersion.current) setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const interval = setInterval(() => { setClock(Date.now()); void load(); }, 3000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [load]);

  const accept = (next: WorkRun) => {
    loadingVersion.current++;
    setSelectedId(next.id);
    setDetail(next);
    setRuns(current => [next, ...current.filter(run => run.id !== next.id)]);
  };

  const mutate = async (path: string, payload: Record<string, unknown>, message: string, create = false) => {
    if (mutating.current) return;
    mutating.current = true;
    loadingVersion.current++;
    setBusy(true); setError(''); setReviewError(''); setNotice('');
    const signature = JSON.stringify({ path, payload });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    try {
      const next = await api<WorkRun>(path, { ...payload, [create ? 'requestId' : 'eventKey']: pending.current.key });
      if (!alive.current) return;
      pending.current = null;
      accept(next); setCreating(false); setReview(null); setNotice(message);
      await changeHandler.current();
    } catch (failure) {
      if (!alive.current) return;
      const text = failure instanceof Error ? failure.message : 'This work could not be updated. Please try again.';
      setError(text); setReviewError(text); errorHandler.current(failure);
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { setDetail(null); setRuns([]); setReview(null); }
    } finally {
      mutating.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const control = (action: 'pause' | 'resume' | 'cancel') => {
    if (!detail) return;
    const message = action === 'pause' ? 'Job paused. Completed work stays saved.' : action === 'cancel' ? 'Job canceled. Completed work stays saved; unused credits are released.' : detail.status === 'waiting_cost_approval' ? 'Estimate refreshed. Review the current scope and maximum.' : 'Job checked and prepared to continue.';
    void mutate(`/work/${encodeURIComponent(detail.id)}/control`, { action, expectedVersion: detail.version }, message);
  };
  const decide = (decision: 'approve' | 'deny') => {
    if (!review) return;
    void mutate(`/work/${encodeURIComponent(review.id)}/decision`, { decision, expectedVersion: review.version, quoteId: review.budget.quoteId }, decision === 'approve' ? 'Cost approved for this job and maximum.' : 'Cost declined. Remaining work will not run.');
  };
  const create = () => void mutate('/work', {
    presetId: preset.id,
    ...(data.actor.role !== 'manager' && propertyId ? { propertyId } : {}),
    ...(data.actor.role === 'dispositions' && investorId ? { investorId } : {}),
    ...(data.actor.role === 'dispositions' ? { includeResearch } : {}),
  }, 'Job saved. Its steps and estimated cost are shown below.', true);

  const completed = detail?.steps.filter(step => step.status === 'completed').length ?? 0;
  const expired = detail ? Date.parse(detail.budget.expiresAt) <= clock : false;
  const reviewExpired = review ? Date.parse(review.budget.expiresAt) <= clock : false;
  const reviewChanged = !!review && !!detail && detail.id === review.id && (detail.version !== review.version || detail.budget.quoteId !== review.budget.quoteId);
  const canPause = !!detail && ['queued', 'running', 'waiting_for_dependency'].includes(detail.status);
  const canResume = !!detail && !detail.question && ['paused', 'failed', 'waiting_for_input'].includes(detail.status) && !detail.contentRestricted;
  const canCancel = !!detail && !['completed', 'canceled', 'reconciling'].includes(detail.status);

  return <section className="work-runs" aria-label="Saved Copilot jobs">
    <AssignmentReviewsPanel/>
    <RolePreparationsPanel/>
    <details className="work-tool-section" open={!!initialHandoffId}><summary>Shared handoffs · ownership and next actions</summary><HandoffsPanel key={initialHandoffId??"board"} initialId={initialHandoffId} onOpenOpportunity={onArtifact?id=>onArtifact({type:"opportunity",id,title:"Review source opportunity"}):undefined}/></details>
    <details className="work-tool-section" open={!!initialAnalysisId}><summary>Deal analysis · assumptions and scenarios</summary><AnalysisPanel key={initialAnalysisId??"board"} initialId={initialAnalysisId}/></details>
    {data.actor.role!=='dispositions'&&<><details className="work-tool-section" open={!!initialOpportunityId}><summary>New opportunities · wholesaler intake and screening</summary><OpportunitiesPanel onAsk={onAsk} key={initialOpportunityId??"board"} initialId={initialOpportunityId} onOpenHandoff={onArtifact?id=>onArtifact({type:"handoff",id,title:"Review shared follow-through"}):undefined} onOpenAnalysis={onArtifact?id=>onArtifact({type:"analysis",id,title:"Review acquisition scenario"}):undefined}/></details><details className="work-tool-section"><summary>Inventory intake · existing property review</summary><AcquisitionIntakePanel data={data} onChange={onChange}/></details></>}
    <div className="work-runs-heading"><div><h2>Put a plan in motion.</h2><p>Keep the steps, results and spending decision together. Your job stays saved when you leave this page.</p></div><button className="button primary" disabled={busy} onClick={() => { setError(''); setCreating(true); }}><Plus size={16}/>New sample job</button></div>
    <div className="work-demo-notice"><Info size={17}/><span>Fictional records and simulated job costs. These jobs do not collect payment or contact investors. AI reasoning has a separate assignment spending review when enabled; included local steps add no AI charge.</span></div>
    {notice && <p className="work-status-notice" role="status">{notice}</p>}
    {error && <div className="work-run-error" role="alert"><p>{error}</p><button className="text-link" disabled={busy} onClick={() => void load()}><RefreshCw size={13}/>Refresh saved work</button></div>}
    {loading ? <Panel><Spinner label="Loading saved jobs…"/></Panel> : !runs.length && !detail ? <Panel><EmptyState icon={<Sparkles size={27}/>} title="One request. A saved plan." description="Start a sample workflow for your role to see connected steps, progress, and the whole-job spending decision." action={<button className="button primary" onClick={() => setCreating(true)}><Plus size={16}/>Prepare your first job</button>}/></Panel> : <div className="work-runs-layout">
      <Panel className="work-runs-list"><SectionHead title="Your jobs" aside={<Badge>{runs.length}</Badge>}/>{runs.map(run => <button key={run.id} className={`work-run-option${run.id === detail?.id ? ' selected' : ''}`} aria-current={run.id === detail?.id ? 'true' : undefined} disabled={busy} onClick={() => { loadingVersion.current++; setSelectedId(run.id); setDetail(run); setNotice(''); setError(''); }}><strong>{run.title}</strong><small>{run.steps.filter(step => step.status === 'completed').length} of {run.steps.length} steps complete · {moment(run.createdAt)}</small><span><Badge tone={statusTone(run.status)}>{statusLabels[run.status]}</Badge><span className="work-run-cost">Up to {dollars(run.budget.maximumCents)}</span></span></button>)}</Panel>
      {detail ? <Panel className="work-run-detail"><div className="work-run-title"><div><p className="eyebrow">SAVED COPILOT JOB</p><h3>{detail.title}</h3></div><Badge tone={statusTone(detail.status)}>{statusLabels[detail.status]}</Badge></div>
        <p className="work-run-instructions">{detail.instructions}</p>
        {detail.costScope==='included_local'&&<p className="work-review-note">{includedLocalWorkNotice}</p>}
        {detail.contentRestricted && <div className="work-run-error"><p>Some saved context is no longer available with your current access. Protected results are hidden. You can still stop the remaining work.</p></div>}
        <dl className="work-cost-summary"><div><dt>Estimated total</dt><dd>{dollars(detail.budget.estimatedCents)}</dd><small>Simulated credits</small></div><div><dt>Job maximum</dt><dd>{dollars(detail.budget.maximumCents)}</dd><small>{detail.budget.approvedMaximumCents !== null ? `Approved up to ${dollars(detail.budget.approvedMaximumCents)}` : 'Approval above $1'}</small></div><div><dt>Spent so far</dt><dd>{dollars(detail.budget.spentCents)}</dd><small>{dollars(detail.budget.reservedCents)} still held</small></div></dl>
        {detail.status === 'waiting_cost_approval' && <div className="work-cost-request"><h4><ShieldCheck size={17}/>Your spending decision</h4><p>{expired ? 'This estimate expired. Refresh it before reviewing the current job.' : `The complete job is quoted up to ${dollars(detail.budget.maximumCents)}. Review the steps and maximum before anything further runs.`}</p>{expired ? <button className="button secondary" disabled={busy || detail.contentRestricted} onClick={() => control('resume')}><RefreshCw size={15}/>Refresh estimate</button> : <button className="button primary" disabled={busy || detail.contentRestricted} onClick={() => { setReviewError(''); setReview(structuredClone(detail)); }}><ShieldCheck size={15}/>Review cost & scope</button>}</div>}
        {detail.question&&<WorkQuestionPanel key={`${detail.id}:${detail.question.reference}`} run={detail} onSaved={accept}/>}
        {detail.lastError && !detail.question && <div className="work-run-error"><p>{detail.lastError}</p></div>}
        {detail.status === 'reconciling' && <p className="work-review-note">An outcome needs review. Its credits remain held until it is resolved; the uncertain step will not be repeated automatically.</p>}
        {(canPause || canResume || canCancel) && <div className="work-run-controls">{canPause && <button className="button secondary small" disabled={busy} onClick={() => control('pause')}><CirclePause size={15}/>Pause job</button>}{canResume && <button className="button secondary small" disabled={busy} onClick={() => control('resume')}><Play size={15}/>Resume job</button>}{canCancel && <button className="text-link" disabled={busy} onClick={() => control('cancel')}><X size={14}/>Cancel remaining work</button>}{busy && <Spinner label="Saving…"/>}</div>}
        <div className="work-progress-label"><strong>Steps & results</strong><span>{completed} of {detail.steps.length} complete</span></div><div className="work-progress-track" role="progressbar" aria-label="Completed job steps" aria-valuemin={0} aria-valuemax={Math.max(1, detail.steps.length)} aria-valuenow={completed}><span style={{ width: `${detail.steps.length ? completed / detail.steps.length * 100 : 0}%` }}/></div>
        <ol className="work-step-list">{detail.steps.map((step, index) => <li key={`${step.planVersion}:${step.key}`} className={`work-step ${step.status}`}><span className="work-step-marker" aria-hidden="true">{step.status === 'completed' ? <Check size={14}/> : step.status === 'running' ? <Clock size={14}/> : step.status === 'failed' ? <X size={13}/> : index + 1}</span><div><div className="work-step-title"><strong>{stepName(step.capabilityId)}</strong><small>Up to {dollars(step.maximumCents)}</small></div><p className="work-step-state">{readable(step.status)}{step.completedAt ? ` · ${moment(step.completedAt)}` : ''}</p><WorkStepScope step={step} steps={detail.steps} data={data}/>{step.error && <p className="work-run-error">{step.error}</p>}{step.result && <div className="work-step-result"><p>{step.result.message}</p>{onArtifact && step.result.artifacts.length > 0 && <div className="work-step-artifacts">{step.result.artifacts.filter(artifact => artifact.type !== 'guidance').map((artifact, artifactIndex) => <button className="text-link" key={`${artifact.id ?? artifact.type}:${artifactIndex}`} onClick={() => onArtifact(artifact)}><FileText size={13}/>{artifact.title}<ArrowUpRight size={13}/></button>)}</div>}</div>}</div></li>)}</ol>
        <details className="work-run-history"><summary>Job activity</summary><ol>{detail.events.slice(-12).reverse().map(event => <li key={event.id}><time dateTime={event.createdAt}>{moment(event.createdAt)}</time><span>{event.message}</span></li>)}</ol></details>
      </Panel> : <Panel className="work-empty-detail"><EmptyState title="Choose a saved job" description="Its progress, spending decision and results will appear here."/></Panel>}
    </div>}
    {creating && <Modal title={preset.title} onClose={() => !busy && setCreating(false)}><form className="work-new-form" onSubmit={event => { event.preventDefault(); create(); }}><p className="panel-description">{preset.description}</p><div className="work-demo-notice"><Info size={16}/><span>Work begins automatically within the $1 threshold. If its complete maximum is more than $1, the saved job waits for your approval. All costs here are simulated.</span></div>{data.actor.role !== 'manager' && <label>Sample property<select value={propertyId} onChange={event => setPropertyId(event.target.value)} required><option value="">Choose a property</option>{data.properties.map(property => <option key={property.id} value={property.id}>{property.address} · {property.city}</option>)}</select></label>}{data.actor.role === 'dispositions' && <><label>Investor context (optional)<select value={investorId} onChange={event => setInvestorId(event.target.value)}><option value="">Match buyers without a specific investor</option>{data.investors.map(investor => <option key={investor.id} value={investor.id}>{investor.name} · {investor.company}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={includeResearch} onChange={event => setIncludeResearch(event.target.checked)}/><span>Add fictional new-investor research<small>Uses fictional prospects, with its extra cost included in the whole-job maximum.</small></span></label></>}{error && <p className="work-run-error" role="alert">{error}</p>}<button className="button primary" disabled={busy || (data.actor.role !== 'manager' && !propertyId)} type="submit">{busy ? <Spinner label="Preparing your job…"/> : <><Sparkles size={16}/>Prepare sample job<ArrowRight size={16}/></>}</button></form></Modal>}
    {review && <Modal title="Review this job’s cost" onClose={() => !busy && setReview(null)}><Badge tone="amber">Demonstration credits only</Badge><div className="work-review-scope"><h3>{review.title}</h3><p>{review.instructions}</p><ol>{review.steps.map(step => <li key={`${step.planVersion}:${step.key}`}><strong>{stepName(step.capabilityId)}</strong> · {readable(step.status)} · up to {dollars(step.maximumCents)}<WorkStepScope step={step} steps={review.steps} data={data}/></li>)}</ol></div><dl className="work-cost-summary"><div><dt>Estimated total</dt><dd>{dollars(review.budget.estimatedCents)}</dd></div><div><dt>Approve maximum</dt><dd>{dollars(review.budget.maximumCents)}</dd></div><div><dt>Already spent</dt><dd>{dollars(review.budget.spentCents)}</dd></div></dl><p className="work-review-note">This decision covers this job and the maximum shown. If the scope or cost grows, the job will pause for a new decision. Approval does not send investor messages or authorize CRM changes.</p><p className="work-review-note">Estimate expires {moment(review.budget.expiresAt)}.</p>{(reviewChanged || reviewExpired) && <p className="work-run-error" role="alert">{reviewChanged ? 'This job changed after you opened the review. Close it and review the latest scope.' : 'This estimate expired. Close this review and refresh the estimate.'}</p>}{reviewError && <p className="work-run-error" role="alert">{reviewError}</p>}<div className="approval-actions work-cost-actions"><button className="button secondary" disabled={busy || reviewChanged} onClick={() => decide('deny')}><X size={15}/>Deny this job</button><button className="button primary" disabled={busy || reviewChanged || reviewExpired} onClick={() => decide('approve')}>{busy ? <Spinner label="Saving decision…"/> : <><ShieldCheck size={16}/>Approve up to {dollars(review.budget.maximumCents)}</>}</button></div></Modal>}
  </section>;
}
