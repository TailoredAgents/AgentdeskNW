'use client';

import {PackageInboxPreparation} from './PackageInboxPreparation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  Building2,
  Check,
  Clipboard,
  FileText,
  Home,
  LockKeyhole,
  Package,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { Bootstrap, NoteSummary } from '@/lib/contracts';
import type {
  BuyBox,
  CallBriefing,
  CallPriority,
  DealPackage,
  Debrief,
  DebriefProposal,
  Disclosure,
  InvestorIntelligence,
  PhaseTwoState,
  PropertyRelease,
  ReleaseInput,
} from '@/lib/intelligence-contracts';
import {
  api,
  Badge,
  day,
  EmptyState,
  Modal,
  money,
  PageHeading,
  Panel,
  readable,
  SectionHead,
  Spinner,
} from './ui';
import { NotesPanel } from './WorkPanels';
import { JourneyPanel } from './JourneyPanel';

export type IntelligenceCommon = {
  data: Bootstrap;
  intelligence: PhaseTwoState;
  onChange: (message?: string) => Promise<void>;
  onError: (error: unknown) => void;
};
export type PackageSelection = { investorId?: string; releaseId?: string; packageId?: string };
export type DebriefSelection = { investorId?: string; propertyId?: string; debriefId?: string };
const split = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const numeric = (value: string) => (value.trim() ? Number(value) : null);
const localDateTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Please try again.');
const values = (value: unknown): string =>
  value == null || value === ''
    ? 'Not recorded'
    : Array.isArray(value)
      ? value.map(values).join(', ')
      : typeof value === 'object'
        ? Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => `${readable(key)}: ${values(item)}`)
            .join(' · ')
        : String(value);

function Points({ items, empty }: { items: string[]; empty?: string }) {
  return items.length ? (
    <ul className="intelligence-points">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  ) : empty ? (
    <p className="muted">{empty}</p>
  ) : null;
}
function DisclosureBadge({ disclosure }: { disclosure: Disclosure }) {
  const valid =
    disclosure.status === 'signed' && (!disclosure.expiresAt || new Date(disclosure.expiresAt) > new Date());
  return (
    <Badge tone={valid ? 'green' : 'amber'}>
      <ShieldCheck size={11} />
      {valid ? 'Disclosure signed' : `Disclosure ${readable(disclosure.status).toLowerCase()}`}
    </Badge>
  );
}
export function BuyBoxCard({ box }: { box: BuyBox }) {
  return (
    <div className="buybox-card">
      <div className="section-head">
        <h3>{box.label}</h3>
        <Badge tone={box.active ? 'green' : 'neutral'}>
          {box.active ? 'Active' : 'Inactive'} · v{box.version}
        </Badge>
      </div>
      <div className="buybox-tags">
        {[
          ...box.counties.map((county) => `${county} County`),
          ...box.cities,
          ...box.zipCodes,
          ...box.states,
        ].map((place, index) => (
          <Badge key={`${place}-${index}`}>{place}</Badge>
        ))}
      </div>
      <dl className="intelligence-facts">
        <div>
          <dt>Purchase range</dt>
          <dd>
            {box.priceMin !== null ? money(box.priceMin) : 'No minimum'} –{' '}
            {box.priceMax !== null ? money(box.priceMax) : 'No maximum'}
          </dd>
        </div>
        <div>
          <dt>Strategy</dt>
          <dd>{box.strategies.map(readable).join(', ') || 'Needs qualification'}</dd>
        </div>
        <div>
          <dt>Property / rehab</dt>
          <dd>
            {box.propertyTypes.join(', ') || 'Not specified'} ·{' '}
            {box.rehabLevels.map(readable).join(', ') || 'Rehab unknown'}
          </dd>
        </div>
        <div>
          <dt>Financing</dt>
          <dd>{box.financing.join(', ') || 'Not recorded'}</dd>
        </div>
      </dl>
      <details className="source-details">
        <summary>Criteria and source</summary>
        <dl className="intelligence-facts">
          <div>
            <dt>ARV range</dt>
            <dd>
              {box.arvMin === null && box.arvMax === null
                ? 'Not recorded'
                : `${box.arvMin === null ? 'Unknown' : money(box.arvMin)} – ${box.arvMax === null ? 'Unknown' : money(box.arvMax)}`}
            </dd>
          </div>
          <div>
            <dt>Minimum beds / baths</dt>
            <dd>
              {box.bedsMin ?? 'Unknown'} / {box.bathsMin ?? 'Unknown'}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {box.sqftMin ?? 'Unknown'} – {box.sqftMax ?? 'Unknown'} sqft
            </dd>
          </div>
          <div>
            <dt>Excluded areas</dt>
            <dd>{box.excludedAreas.join(', ') || 'None recorded'}</dd>
          </div>
          <div>
            <dt>Geographic flexibility</dt>
            <dd>{box.geographicFlexibility ? 'Flexible' : 'Within recorded areas'}</dd>
          </div>
        </dl>
        <blockquote>{box.provenance.statement}</blockquote>
        <p className="subtle-note">
          {box.provenance.source} · {day(box.provenance.capturedAt)} · {readable(box.provenance.verification)}{' '}
          · {readable(box.provenance.reviewStatus)} · {readable(box.provenance.syncStatus)}
        </p>
      </details>
    </div>
  );
}

export function BriefingModal({
  investorId,
  propertyId,
  actor,
  onChange,
  onClose,
  onPackage,
  onDebrief,
}: {
  investorId: string;
  propertyId?: string;
  actor: Bootstrap['actor'];
  onChange?: () => Promise<void>;
  onClose: () => void;
  onPackage: (selection: PackageSelection) => void;
  onDebrief: (selection: DebriefSelection) => void;
}) {
  const [brief, setBrief] = useState<CallBriefing | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<CallBriefing>(
      `/investors/${investorId}/briefing${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`,
    )
      .then((result) => {
        if (active) setBrief(result);
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [investorId, propertyId]);
  return (
    <Modal title="Your pre-call briefing" onClose={onClose} wide>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : !brief ? (
        <div className="intelligence-loading" role="status">
          <Spinner label="Gathering permitted relationship context…" />
        </div>
      ) : (
        <div className="intelligence-stack">
          <div className="intelligence-person">
            <span className="company-avatar large">
              {brief.investor.name
                .split(' ')
                .map((word) => word[0])
                .join('')
                .slice(0, 2)}
            </span>
            <div>
              <h3>{brief.investor.name}</h3>
              <p>{brief.investor.company}</p>
            </div>
            <DisclosureBadge disclosure={brief.disclosure} />
          </div>
          <JourneyPanel key={`${actor.id}-${investorId}`} investorId={investorId} propertyId={propertyId} onChange={onChange} canEdit={actor.role === 'manager' || (actor.role === 'dispositions' && brief.investor.ownerId === actor.id)} />
          <details className="briefing-record-details">
            <summary>Review full pre-call context</summary>
            <div className="intelligence-stack">
          <div className="call-objective">
            <p className="eyebrow">YOUR CALL OBJECTIVE</p>
            <p>{brief.objective}</p>
          </div>
          <div className="intelligence-columns">
            <div>
              <h4>Last conversation</h4>
              <p>{brief.lastConversation || 'No conversation captured yet.'}</p>
              <p className="subtle-note">
                Last outcome: {brief.lastOutcome ? readable(brief.lastOutcome) : 'Not recorded'} · Last
                contact {day(brief.investor.lastContactAt)}
              </p>
            </div>
            <div>
              <h4>Outstanding commitments</h4>
              <Points
                items={brief.commitments.map(
                  (task) => `${task.title}${task.dueAt ? ` · ${day(task.dueAt)}` : ''}`,
                )}
                empty="No open commitments recorded."
              />
            </div>
          </div>
          <div>
            <h4>Current buy boxes</h4>
            <div className="intelligence-stack compact">
              {brief.buyBoxes.map((box) => (
                <BuyBoxCard key={box.id} box={box} />
              ))}
              {!brief.buyBoxes.length && <p className="muted">No structured buy box recorded.</p>}
            </div>
          </div>
          {brief.matches.length > 0 && (
            <div>
              <h4>Matching context</h4>
              {brief.matches.map((match) => (
                <div className="match-evidence" key={`${match.propertyId}-${match.buyBoxId}`}>
                  <Badge tone="green">Property fit {match.score}/100</Badge>
                  <Badge>Engagement {match.engagementScore}/100</Badge>
                  <Points items={match.reasons} />
                  <Points items={match.conflicts} />
                </div>
              ))}
            </div>
          )}
          <div>
            <h4>Questions worth asking</h4>
            <Points
              items={brief.missing}
              empty="No specific qualification gaps identified. Confirm the investor’s current plans."
            />
          </div>
          <p className="subtle-note">
            {brief.source} · Fictional relationship data. Contact details are not verified.
          </p>
            </div>
          </details>
          <div className="intelligence-actions">
            <button className="button primary" onClick={() => onDebrief({ investorId, propertyId })}>
              <FileText size={15} />
              Capture post-call debrief
            </button>
            <button className="button secondary" onClick={() => onPackage({ investorId })}>
              <Package size={15} />
              Prepare deal package
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CallingQueuePanel({
  data,
  intelligence,
  onChange,
  onError,
  onBrief,
  onPackage,
  onDebrief,
}: IntelligenceCommon & {
  onBrief: (investorId: string, propertyId?: string) => void;
  onPackage: (selection: PackageSelection) => void;
  onDebrief: (selection: DebriefSelection) => void;
}) {
  const [propertyId, setPropertyId] = useState('');
  const [filtered, setFiltered] = useState<CallPriority[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const filterRequest = useRef(0);
  const [outcomeFor, setOutcomeFor] = useState<CallPriority | null>(null);
  const [outcomeError, setOutcomeError] = useState('');
  const [outcome, setOutcome] = useState('connected');
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = filtered || intelligence.callingQueue;
  const visible = queue.filter((item) => showDismissed || !item.dismissed);
  const updateFilter = async (id: string, includeDismissed = showDismissed) => {
    const request = ++filterRequest.current;
    setPropertyId(id);
    setFiltered(null);
    if (!id && !includeDismissed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api<CallPriority[]>(
        `/calling-queue?includeDismissed=${includeDismissed}${id ? `&propertyId=${encodeURIComponent(id)}` : ''}`,
      );
      if (request === filterRequest.current) setFiltered(result);
    } catch (error) {
      onError(error);
    } finally {
      if (request === filterRequest.current) setLoading(false);
    }
  };
  const priority = async (item: CallPriority, input: { dismissed?: boolean; manualPriority?: number }) => {
    try {
      await api(`/investors/${item.investor.id}/priority`, input);
      await onChange(
        input.dismissed === false
          ? 'Investor restored to your calling queue'
          : input.dismissed
            ? 'Calling suggestion dismissed'
            : 'Calling priority updated',
      );
      if (propertyId || showDismissed) await updateFilter(propertyId);
    } catch (error) {
      onError(error);
    }
  };
  const saveOutcome = async () => {
    if (!outcomeFor) return;
    setBusy(true);
    setOutcomeError('');
    try {
      await api(`/investors/${outcomeFor.investor.id}/outcome`, {
        outcome,
        notes: notes.trim() || undefined,
        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
      });
      setOutcomeFor(null);
      await onChange('Call outcome recorded');
      if (propertyId || showDismissed) await updateFilter(propertyId);
    } catch (error) {
      setOutcomeError(errorText(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="RELATIONSHIPS, IN THE RIGHT ORDER"
        title="Your next call starts here."
        description="Real priorities from permitted demo records, current releases and the promises you have made."
        action={<Badge tone="amber">Live ranking · Demo data</Badge>}
      />
      <div className="intelligence-toolbar">
        <label>
          Focus on a property
          <select value={propertyId} onChange={(event) => void updateFilter(event.target.value)}>
            <option value="">All current inventory</option>
            {data.properties.map((property) => (
              <option value={property.id} key={property.id}>
                {property.address}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={(event) => {
              setShowDismissed(event.target.checked);
              void updateFilter(propertyId, event.target.checked);
            }}
          />
          Show dismissed suggestions
        </label>
        <span>{visible.length} permitted relationships</span>
      </div>
      <div className="intelligence-stack">
        {loading ? (
          <Panel>
            <Spinner label="Recalculating property matches…" />
          </Panel>
        ) : (
          visible.map((item) => (
            <Panel key={item.investor.id} className={`call-card ${item.dismissed ? 'is-dismissed' : ''}`}>
              <div className="call-card-heading">
                <span className="call-rank">{String(item.rank).padStart(2, '0')}</span>
                <div className="call-person">
                  <h2>{item.investor.name}</h2>
                  <p>
                    {item.investor.company} <span>· Last contact {day(item.investor.lastContactAt)}</span>
                  </p>
                </div>
                <DisclosureBadge disclosure={item.disclosure} />
                <button
                  className="icon-button"
                  aria-label={`${item.dismissed ? 'Restore' : 'Dismiss'} ${item.investor.name}`}
                  onClick={() => void priority(item, { dismissed: !item.dismissed })}
                >
                  {item.dismissed ? <Plus size={16} /> : <X size={16} />}
                </button>
              </div>
              <div className="call-card-content">
                <div>
                  <p className="eyebrow">WHY THIS CALL MATTERS</p>
                  <Points items={item.reasons} />
                  <div className="score-row">
                    <span>
                      <strong>{item.score}</strong> Call priority
                    </span>
                    <span>
                      <strong>{item.match?.score ?? '—'}</strong> Property fit
                    </span>
                    <span>
                      <strong>{item.engagementScore}</strong> Engagement
                    </span>
                  </div>
                </div>
                <div className="call-context">
                  {item.property ? (
                    <>
                      <div className="call-property">
                        <Home size={19} />
                        <div>
                          <strong>{item.property.address}</strong>
                          <p>
                            {item.property.city} · {money(item.property.price)}
                          </p>
                        </div>
                      </div>
                      <p className="subtle-note">{item.match?.buyBoxLabel || 'Qualification opportunity'}</p>
                      <Points items={item.match?.conflicts || []} />
                    </>
                  ) : (
                    <p className="muted">Relationship follow-up. No released property match identified.</p>
                  )}
                  <h4>Start the conversation</h4>
                  <Points items={item.talkingPoints} />
                  <p className="subtle-note">
                    {item.investor.phone ? `Demo phone: ${item.investor.phone}` : 'Phone not recorded'} ·{' '}
                    {item.lastOutcome ? readable(item.lastOutcome) : 'No call outcome recorded'}
                  </p>
                </div>
              </div>
              <div className="call-card-actions">
                <button
                  className="button primary"
                  onClick={() => onBrief(item.investor.id, item.property?.id)}
                >
                  <Phone size={15} />
                  Get ready to call
                </button>
                <button
                  className="button secondary"
                  onClick={() => onDebrief({ investorId: item.investor.id, propertyId: item.property?.id })}
                >
                  <FileText size={15} />
                  Quick debrief
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setOutcomeFor(item);
                    setOutcomeError('');
                    setOutcome('connected');
                    setNotes('');
                    setFollowUpAt('');
                  }}
                >
                  Log outcome
                </button>
                <button
                  className="text-link"
                  onClick={() =>
                    onPackage({
                      investorId: item.investor.id,
                      releaseId: intelligence.releases.find(
                        (release) =>
                          release.propertyId === item.property?.id && release.status === 'released',
                      )?.id,
                    })
                  }
                >
                  Prepare package
                  <ArrowRight size={13} />
                </button>
                <button
                  className="text-link"
                  onClick={() =>
                    void priority(item, {
                      manualPriority: item.manualPriority > 0 ? 0 : 30,
                      dismissed: false,
                    })
                  }
                >
                  <ArrowUp size={13} />
                  {item.manualPriority > 0 ? 'Clear priority boost' : 'Move up'}
                </button>
              </div>
            </Panel>
          ))
        )}
        {!loading && !visible.length && (
          <Panel>
            <EmptyState
              icon={<Phone size={25} />}
              title="No calls waiting in this view"
              description="Try another property or restore a dismissed suggestion."
            />
          </Panel>
        )}
      </div>
      <p className="demo-footnote">
        <ShieldCheck size={14} />
        Priority, property fit and engagement measure different signals. None predicts a purchase.
      </p>
      {outcomeFor && (
        <Modal
          title={`Call outcome · ${outcomeFor.investor.name}`}
          onClose={() => !busy && setOutcomeFor(null)}
        >
          <form
            className="intelligence-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void saveOutcome();
            }}
          >
            <label>
              What happened?
              <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                {['connected', 'no_answer', 'left_message', 'interested', 'not_interested', 'paused'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {readable(value)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Quick note
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="What should you remember next time?"
              />
            </label>
            <label>
              Follow-up time (optional)
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
              />
            </label>
            <p className="subtle-note">Use a debrief to turn new buyer criteria into reviewed CRM changes.</p>
            {outcomeError && (
              <p className="error-text" role="alert">
                {outcomeError}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : (
                <>
                  <Check size={15} />
                  Save call outcome
                </>
              )}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function InvestorIntelligenceSection({
  profile,
  data,
  members,
  onChange,
  onError,
  onReview,
  onBrief,
  onPackage,
}: {
  profile: InvestorIntelligence;
  data: Bootstrap;
  members: PhaseTwoState['members'];
  onChange: (message?: string) => Promise<void>;
  onError: (error: unknown) => void;
  onReview: () => void;
  onBrief: () => void;
  onPackage: () => void;
}) {
  const [editing, setEditing] = useState<BuyBox | 'new' | null>(null);
  const canEdit = data.actor.role === 'manager' || profile.investor.ownerId === data.actor.id;
  const [disclosure, setDisclosure] = useState(false);
  const [status, setStatus] = useState<Disclosure['status']>(profile.disclosure.status);
  const [documentRef, setDocumentRef] = useState(profile.disclosure.documentRef || '');
  const [disclosureError, setDisclosureError] = useState('');
  const [busy, setBusy] = useState(false);
  const saveDisclosure = async () => {
    setBusy(true);
    setDisclosureError('');
    try {
      await api(`/investors/${profile.investor.id}/disclosure`, {
        status,
        version: profile.disclosure.version || 'demo-disclosure-v1',
        documentRef: documentRef || null,
      });
      setDisclosure(false);
      await onChange('Synthetic disclosure evidence recorded');
    } catch (error) {
      setDisclosureError(errorText(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="profile-intelligence">
      <SectionHead
        title="Investor intelligence"
        aside={<Badge>{readable(profile.visibility)} access</Badge>}
      />
      <div className="intelligence-actions">
        <button className="button secondary" onClick={onBrief}>
          <Phone size={15} />
          Pre-call briefing
        </button>
        <button className="button secondary" onClick={onPackage}>
          <Package size={15} />
          Prepare deal package
        </button>
      </div>
      <JourneyPanel key={`${data.actor.id}-${profile.investor.id}`} investorId={profile.investor.id} onChange={onChange} canEdit={canEdit && data.actor.role !== 'acquisitions'} />
      <details className="profile-record-details">
        <summary>Investor criteria and CRM records</summary>
      <dl className="intelligence-facts">
        <div>
          <dt>Relationship owner</dt>
          <dd>
            {members.find((member) => member.id === profile.investor.ownerId)?.name ||
              'Another authorized teammate'}
          </dd>
        </div>
        <div>
          <dt>Qualification</dt>
          <dd>{readable(profile.qualificationStatus)}</dd>
        </div>
        <div>
          <dt>Current activity</dt>
          <dd>{readable(profile.currentActivity)}</dd>
        </div>
        <div>
          <dt>Preferred communication</dt>
          <dd>{readable(profile.communicationPreference)}</dd>
        </div>
      </dl>
      <p className="subtle-note">
        {profile.relationshipSource} ·{' '}
        {profile.salesforceRef
          ? 'Salesforce reference stored; no live sync'
          : 'Local demo record; Salesforce not connected'}
      </p>
      {profile.activitySource && <p className="subtle-note">Activity source: {profile.activitySource}</p>}
      <div className="disclosure-card">
        <div>
          <DisclosureBadge disclosure={profile.disclosure} />
          <p>
            {profile.disclosure.synthetic ? 'Synthetic demonstration evidence' : profile.disclosure.source} ·
            Version {profile.disclosure.version}
          </p>
          <small>
            {profile.disclosure.documentRef || 'No disclosure document reference'}
            {profile.disclosure.expiresAt ? ` · Expires ${day(profile.disclosure.expiresAt)}` : ''}
          </small>
        </div>
        {data.actor.role === 'manager' && (
          <button className="text-link" onClick={() => setDisclosure(!disclosure)}>
            Record demo evidence
          </button>
        )}
      </div>
      {disclosure && (
        <form
          className="intelligence-stack compact"
          onSubmit={(event) => {
            event.preventDefault();
            void saveDisclosure();
          }}
        >
          <div className="form-grid">
            <label>
              Disclosure status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Disclosure['status'])}
              >
                {[
                  'unknown',
                  'not_requested',
                  'prepared',
                  'sent',
                  'opened',
                  'signed',
                  'declined',
                  'expired',
                ].map((value) => (
                  <option key={value} value={value}>
                    {readable(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Demo document reference
              <input
                value={documentRef}
                onChange={(event) => setDocumentRef(event.target.value)}
                maxLength={200}
                placeholder="demo:disclosure-reference"
                required={status === 'signed'}
              />
            </label>
          </div>
          <p className="subtle-note">
            This records a local demo event. It does not request, send or sign a document.
          </p>
          {disclosureError && (
            <p className="error-text" role="alert">
              {disclosureError}
            </p>
          )}
          <button className="button secondary" disabled={busy}>
            {busy ? <Spinner /> : 'Save demo evidence'}
          </button>
        </form>
      )}
      <div className="section-head intelligence-subhead">
        <h3>
          Buy boxes <span className="muted">({profile.buyBoxes.length})</span>
        </h3>
        {canEdit ? (
          <button className="text-link" onClick={() => setEditing('new')}>
            <Plus size={13} />
            Add buy box
          </button>
        ) : (
          <Badge>Shared read access</Badge>
        )}
      </div>
      <div className="intelligence-stack compact">
        {profile.buyBoxes.map((box) => (
          <div key={box.id}>
            <BuyBoxCard box={box} />
            {canEdit && (
              <button className="text-link buybox-edit" onClick={() => setEditing(box)}>
                Propose revised criteria
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        ))}
        {!profile.buyBoxes.length && (
          <p className="muted">
            No structured buy box yet. Add confirmed criteria after your next conversation.
          </p>
        )}
      </div>
      {editing && (
        <BuyBoxEditor
          key={editing === 'new' ? 'new' : editing.id}
          investorId={profile.investor.id}
          box={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onChange={onChange}
          onError={onError}
          onReview={onReview}
        />
      )}
      {canEdit && (
        <SharingEditor
          profile={profile}
          data={data}
          members={members}
          onChange={onChange}
          onError={onError}
        />
      )}
      <details className="source-details">
        <summary>Relationship timeline</summary>
        {profile.history.length ? (
          profile.history.map((event) => (
            <div className="timeline-event" key={event.id}>
              <Badge>{readable(event.kind)}</Badge>
              <p>{event.summary}</p>
              <small>
                {day(event.occurredAt)} · {event.source}
              </small>
            </div>
          ))
        ) : (
          <p className="muted">No relationship events recorded yet.</p>
        )}
      </details>
      </details>
    </section>
  );
}

function BuyBoxEditor({
  investorId,
  box,
  onCancel,
  onChange,
  onError,
  onReview,
}: {
  investorId: string;
  box?: BuyBox;
  onCancel: () => void;
  onChange: (message?: string) => Promise<void>;
  onError: (error: unknown) => void;
  onReview: () => void;
}) {
  const [form, setForm] = useState({
    label: box?.label || '',
    states: box?.states.join(', ') || 'GA',
    counties: box?.counties.join(', ') || '',
    cities: box?.cities.join(', ') || '',
    zipCodes: box?.zipCodes.join(', ') || '',
    excludedAreas: box?.excludedAreas.join(', ') || '',
    geographicFlexibility: box?.geographicFlexibility || false,
    priceMin: box?.priceMin?.toString() || '',
    priceMax: box?.priceMax?.toString() || '',
    arvMin: box?.arvMin?.toString() || '',
    arvMax: box?.arvMax?.toString() || '',
    propertyTypes: box?.propertyTypes.join(', ') || '',
    sqftMin: box?.sqftMin?.toString() || '',
    sqftMax: box?.sqftMax?.toString() || '',
    bedsMin: box?.bedsMin?.toString() || '',
    bathsMin: box?.bathsMin?.toString() || '',
    strategies: box?.strategies.join(', ') || '',
    rehabLevels: box?.rehabLevels.join(', ') || '',
    financing: box?.financing.join(', ') || '',
    active: box?.active ?? true,
    sourceStatement: '',
  });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const textField = (field: keyof typeof form, label: string, placeholder = '') => (
    <label key={field}>
      {label}
      <input
        value={String(form[field])}
        onChange={(event) => setForm({ ...form, [field]: event.target.value })}
        placeholder={placeholder}
        maxLength={500}
      />
    </label>
  );
  const numberField = (field: keyof typeof form, label: string) => (
    <label key={field}>
      {label}
      <input
        type="number"
        min="0"
        value={String(form[field])}
        onChange={(event) => setForm({ ...form, [field]: event.target.value })}
        placeholder="Unknown"
      />
    </label>
  );
  const save = async () => {
    setBusy(true);
    const input = {
      ...form,
      ...Object.fromEntries(
        [
          'states',
          'counties',
          'cities',
          'zipCodes',
          'excludedAreas',
          'propertyTypes',
          'strategies',
          'rehabLevels',
          'financing',
        ].map((key) => [key, split(String(form[key as keyof typeof form]))]),
      ),
      ...Object.fromEntries(
        ['priceMin', 'priceMax', 'arvMin', 'arvMax', 'sqftMin', 'sqftMax', 'bedsMin', 'bathsMin'].map(
          (key) => [key, numeric(String(form[key as keyof typeof form]))],
        ),
      ),
      ...(box ? { expectedVersion: box.version } : {}),
      source: 'Employee confirmed demo criteria',
    };
    try {
      await api(`/investors/${investorId}/buy-boxes`, { input, ...(box ? { existingId: box.id } : {}) });
      await onChange('Buy-box changes prepared for review');
      onCancel();
      onReview();
    } catch (error) {
      setLocalError(errorText(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="buybox-editor intelligence-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <SectionHead
        title={box ? 'Revise confirmed criteria' : 'Add a separate buy box'}
        aside={
          <button type="button" className="text-link" onClick={onCancel}>
            Cancel
          </button>
        }
      />
      <p className="panel-description">
        Keep distinct purchase strategies in separate buy boxes. Unknown details can stay blank. Nothing
        changes until you review and approve.
      </p>
      <div className="form-grid">
        {textField('label', 'Buy-box name', 'Cobb cosmetic flips')}
        {textField('states', 'States', 'GA')}
        {textField('counties', 'Counties', 'Cobb, Cherokee')}
        {textField('cities', 'Cities', 'Marietta')}
        {textField('zipCodes', 'ZIP codes')}
        {textField('excludedAreas', 'Excluded areas')}
        {numberField('priceMin', 'Minimum purchase price')}
        {numberField('priceMax', 'Maximum purchase price')}
        {textField('strategies', 'Strategies', 'Fix & flip, Buy & hold')}
        {textField('propertyTypes', 'Property types', 'Single-family')}
        {textField('rehabLevels', 'Rehab levels', 'Light, Medium')}
        {textField('financing', 'Financing', 'Cash')}
      </div>
      <details className="source-details">
        <summary>Additional property criteria</summary>
        <div className="form-grid">
          {numberField('arvMin', 'Minimum ARV')}
          {numberField('arvMax', 'Maximum ARV')}
          {numberField('sqftMin', 'Minimum square feet')}
          {numberField('sqftMax', 'Maximum square feet')}
          {numberField('bedsMin', 'Minimum bedrooms')}
          {numberField('bathsMin', 'Minimum bathrooms')}
        </div>
      </details>
      <div className="intelligence-actions">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.geographicFlexibility}
            onChange={(event) => setForm({ ...form, geographicFlexibility: event.target.checked })}
          />
          Geographically flexible
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          Active buy box
        </label>
      </div>
      <label>
        Investor’s source statement
        <textarea
          value={form.sourceStatement}
          onChange={(event) => setForm({ ...form, sourceStatement: event.target.value })}
          required
          minLength={5}
          rows={3}
          maxLength={4000}
          placeholder="What did the investor confirm?"
        />
      </label>
      {localError && (
        <p className="error-text" role="alert">
          {localError}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || !form.label.trim() || form.sourceStatement.trim().length < 5}
      >
        {busy ? (
          <Spinner />
        ) : (
          <>
            <ShieldCheck size={15} />
            Prepare buy box for review
          </>
        )}
      </button>
    </form>
  );
}

export function ReleasesPanel({
  data,
  intelligence,
  onChange,
  onError,
  onPackage,
  onCalls,
}: IntelligenceCommon & { onPackage: (selection: PackageSelection) => void; onCalls: () => void }) {
  const [editing, setEditing] = useState<PropertyRelease | 'new' | null>(null);
  const canEdit = data.actor.role === 'manager' || data.actor.role === 'acquisitions';
  return (
    <>
      <PageHeading
        eyebrow="FROM ACQUISITION TO THE NEXT CONVERSATION"
        title="A release. A reason to reach out."
        description="Versioned property details, permitted buyer matches and a clear next step for your relationships."
        action={
          canEdit ? (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={16} />
              Create demo release
            </button>
          ) : (
            <Badge tone="amber">Manual demo releases</Badge>
          )
        }
      />
      <div className="intelligence-stack">
        {intelligence.releases.map((release) => (
          <Panel className="release-card" key={release.id}>
            <div className="release-heading">
              <div className="property-mini">
                <Building2 size={25} />
              </div>
              <div>
                <div className="buybox-tags">
                  <Badge tone={release.status === 'released' ? 'green' : 'amber'}>
                    {readable(release.status)}
                  </Badge>
                  <Badge>Version {release.version}</Badge>
                  <Badge>Demo</Badge>
                </div>
                <h2>{release.property.address}</h2>
                <p>
                  {release.property.city} · {release.property.county} County
                </p>
              </div>
              <strong className="release-price">{money(release.property.price)}</strong>
            </div>
            <p className="release-description">
              {release.description || 'No approved description provided.'}
            </p>
            <div className="property-specs">
              <span>{release.property.beds} beds</span>
              <span>{release.property.baths} baths</span>
              <span>{release.property.sqft.toLocaleString()} sqft</span>
              <span>{release.propertyType}</span>
            </div>
            <div className="release-body">
              <div>
                <h4>Deal context</h4>
                <p>{release.notes || 'No additional notes.'}</p>
                <dl className="intelligence-facts">
                  <div>
                    <dt>ARV assumption</dt>
                    <dd>{release.arv !== null ? money(release.arv) : 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Repair assumption</dt>
                    <dd>
                      {release.repairEstimate !== null ? money(release.repairEstimate) : 'Not provided'}
                    </dd>
                  </div>
                </dl>
                <p className="subtle-note">
                  {release.economicsSource ||
                    'No valuation source recorded. These are not verified estimates.'}
                </p>
                <p className="subtle-note">
                  Media: {release.mediaUrl ? readable(release.mediaAccess) : 'No authorized link provided'}
                </p>
              </div>
              <div>
                <h4>Your permitted buyer matches</h4>
                {release.matches.length ? (
                  release.matches.slice(0, 3).map((match) => (
                    <div className="release-match" key={match.investorId}>
                      <div>
                        <strong>{match.investorName}</strong>
                        <small>
                          {match.buyBoxLabel} · Fit {match.score}/100 · Engagement {match.engagementScore}/100
                        </small>
                        <small>{match.reasons[0] || 'Review the full criteria before outreach'}</small>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => onPackage({ investorId: match.investorId, releaseId: release.id })}
                      >
                        Package
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">No permitted buyer matches yet.</p>
                )}
              </div>
            </div>
            <details className="source-details">
              <summary>Release source, audience and transaction context</summary>
              <dl className="intelligence-facts">
                <div>
                  <dt>Source</dt>
                  <dd>{release.source}</dd>
                </div>
                <div>
                  <dt>Released</dt>
                  <dd>
                    {release.releasedAt ? new Date(release.releasedAt).toLocaleString() : 'Not released'}
                  </dd>
                </div>
                <div>
                  <dt>Permitted audience</dt>
                  <dd>
                    {release.authorizedUserIds.length} explicitly authorized teammate
                    {release.authorizedUserIds.length === 1 ? '' : 's'}
                  </dd>
                </div>
                <div>
                  <dt>Upstream seller / wholesaler</dt>
                  <dd>
                    {release.upstreamParty || 'Not recorded'} ·{' '}
                    {release.upstreamStage || 'Stage not recorded'}
                  </dd>
                </div>
                <div>
                  <dt>Downstream transaction</dt>
                  <dd>{release.downstreamStage || 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Closing</dt>
                  <dd>
                    {readable(release.closingStructure)} · {day(release.closingAt)}
                  </dd>
                </div>
              </dl>
              <p className="subtle-note">
                Manually entered fictional release. No Marketplace connection or customer-approved policy is
                implied.
              </p>
            </details>
            <div className="intelligence-actions">
              <button
                className="button primary"
                disabled={release.status !== 'released'}
                onClick={() => onPackage({ releaseId: release.id })}
              >
                <Package size={15} />
                Prepare deal package
              </button>
              <button className="button secondary" onClick={onCalls}>
                <Phone size={15} />
                See calling priorities
              </button>
              {canEdit && (
                <button className="text-link" onClick={() => setEditing(release)}>
                  Revise release
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          </Panel>
        ))}
        {!intelligence.releases.length && (
          <Panel>
            <EmptyState
              icon={<Home size={25} />}
              title="Your next release starts here"
              description={
                canEdit
                  ? 'Create a fictional property release to connect inventory, buyer matches and calling priorities.'
                  : 'An acquisition teammate or manager can create an authorized demo release.'
              }
            />
          </Panel>
        )}
      </div>
      {editing && (
        <Modal
          title={editing === 'new' ? 'Create a demo property release' : 'Revise property release'}
          onClose={() => setEditing(null)}
          wide
        >
          <ReleaseEditor
            data={data}
            members={intelligence.members}
            existingReleases={intelligence.releases}
            release={editing === 'new' ? undefined : editing}
            onChange={onChange}
            onError={onError}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}

function ReleaseEditor({
  data,
  members,
  existingReleases,
  release,
  onChange,
  onError,
  onClose,
}: {
  data: Bootstrap;
  members: PhaseTwoState['members'];
  existingReleases: PropertyRelease[];
  release?: PropertyRelease;
  onChange: (message?: string) => Promise<void>;
  onError: (error: unknown) => void;
  onClose: () => void;
}) {
  const availableProperties = release
    ? data.properties
    : data.properties.filter(
        (property) => !existingReleases.some((existing) => existing.propertyId === property.id),
      );
  const [form, setForm] = useState({
    propertyId: release?.propertyId || availableProperties[0]?.id || '',
    status: release?.status || 'draft',
    source: release?.source || 'Manual fictional demo release',
    propertyType: release?.propertyType || 'Single-family',
    description: release?.description || '',
    notes: release?.notes || '',
    mediaUrl: release?.mediaUrl || '',
    mediaAccess: release?.mediaAccess || 'unverified',
    arv: release?.arv?.toString() || '',
    repairEstimate: release?.repairEstimate?.toString() || '',
    economicsSource: release?.economicsSource || '',
    showingInstructions: release?.showingInstructions || '',
    upstreamParty: release?.upstreamParty || '',
    upstreamStage: release?.upstreamStage || '',
    downstreamStage: release?.downstreamStage || '',
    closingStructure: release?.closingStructure || 'unspecified',
    closingAt: localDateTime(release?.closingAt),
  });
  const [audience, setAudience] = useState<string[]>(
    release?.authorizedUserIds ||
      members.filter((member) => member.role === 'dispositions').map((member) => member.id),
  );
  const [mediaInvestors, setMediaInvestors] = useState<string[]>(release?.permittedMediaInvestorIds || []);
  const [localError, setLocalError] = useState('');
  const [eventKey] = useState(() => `manual-${crypto.randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    setLocalError('');
    const input: ReleaseInput = {
      ...form,
      status: form.status as ReleaseInput['status'],
      mediaAccess: form.mediaAccess as ReleaseInput['mediaAccess'],
      closingStructure: form.closingStructure as ReleaseInput['closingStructure'],
      eventKey,
      ...(release ? { expectedVersion: release.version } : {}),
      mediaUrl: form.mediaUrl.trim() || null,
      arv: numeric(form.arv),
      repairEstimate: numeric(form.repairEstimate),
      closingAt: form.closingAt ? new Date(form.closingAt).toISOString() : null,
      authorizedUserIds: audience,
      permittedMediaInvestorIds: mediaInvestors,
    };
    try {
      await api('/releases', input);
      await onChange(
        form.status === 'released'
          ? 'Property released. Buyer matches and calling priorities are ready.'
          : 'Demo release saved',
      );
      onClose();
    } catch (error) {
      setLocalError(errorText(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="intelligence-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="panel-description">
        Use authorized fictional details. Publishing here updates only the local demo workspace.
      </p>
      {!availableProperties.length && (
        <p className="intelligence-alert">
          Every available property already has a release. Close this form and choose “Revise release” on the
          existing property.
        </p>
      )}
      <div className="form-grid">
        <label>
          Property
          <select
            value={form.propertyId}
            disabled={!!release}
            onChange={(event) => set('propertyId', event.target.value)}
            required
          >
            {availableProperties.map((property) => (
              <option value={property.id} key={property.id}>
                {property.address}
              </option>
            ))}
          </select>
        </label>
        <label>
          Release status
          <select value={form.status} onChange={(event) => set('status', event.target.value)}>
            <option value="draft">Draft</option>
            <option value="released">Released to authorized team</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        <label>
          Property type
          <input
            value={form.propertyType}
            onChange={(event) => set('propertyType', event.target.value)}
            required
            maxLength={100}
          />
        </label>
        <label>
          Source
          <input
            value={form.source}
            onChange={(event) => set('source', event.target.value)}
            required
            maxLength={500}
          />
        </label>
        <label className="span-2">
          Approved deal description
          <textarea
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            rows={3}
            maxLength={4000}
          />
        </label>
        <label className="span-2">
          Property notes
          <textarea
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            rows={3}
            maxLength={4000}
          />
        </label>
        <label>
          ARV assumption
          <input
            type="number"
            min="0"
            value={form.arv}
            onChange={(event) => set('arv', event.target.value)}
            placeholder="Unknown"
          />
        </label>
        <label>
          Repair assumption
          <input
            type="number"
            min="0"
            value={form.repairEstimate}
            onChange={(event) => set('repairEstimate', event.target.value)}
            placeholder="Unknown"
          />
        </label>
        <label className="span-2">
          Source for economics
          <input
            value={form.economicsSource}
            onChange={(event) => set('economicsSource', event.target.value)}
            placeholder="State the source and limitations"
            maxLength={500}
          />
        </label>
        <label>
          Authorized photo / media URL
          <input
            type="url"
            value={form.mediaUrl}
            onChange={(event) => set('mediaUrl', event.target.value)}
            placeholder="https://…"
            maxLength={2000}
          />
        </label>
        <label>
          Media access confirmation
          <select value={form.mediaAccess} onChange={(event) => set('mediaAccess', event.target.value)}>
            <option value="unverified">Not yet confirmed</option>
            <option value="recipient_confirmed">Intended recipients confirmed</option>
            <option value="public_confirmed">Public sharing authorized</option>
          </select>
        </label>
        <label className="span-2">
          Showing / follow-up instructions
          <input
            value={form.showingInstructions}
            onChange={(event) => set('showingInstructions', event.target.value)}
            maxLength={2000}
          />
        </label>
      </div>
      <fieldset className="intelligence-fieldset">
        <legend>Dispositions teammates who can work this release</legend>
        <div className="audience-members">
          {members
            .filter((member) => member.role === 'dispositions')
            .map((member) => (
              <label className="checkbox-label" key={member.id}>
                <input
                  type="checkbox"
                  checked={audience.includes(member.id)}
                  onChange={(event) =>
                    setAudience((current) =>
                      event.target.checked
                        ? [...current, member.id]
                        : current.filter((id) => id !== member.id),
                    )
                  }
                />
                {member.name}
              </label>
            ))}
        </div>
      </fieldset>
      <p className="subtle-note">
        Release owners and office managers also have access. Investor relationships keep separate access
        rules.
      </p>
      {form.mediaAccess === 'recipient_confirmed' && (
        <fieldset className="intelligence-fieldset">
          <legend>Investors with confirmed photo access</legend>
          <div className="audience-members">
            {data.investors.map((investor) => (
              <label className="checkbox-label" key={investor.id}>
                <input
                  type="checkbox"
                  checked={mediaInvestors.includes(investor.id)}
                  onChange={(event) =>
                    setMediaInvestors((current) =>
                      event.target.checked
                        ? [...current, investor.id]
                        : current.filter((id) => id !== investor.id),
                    )
                  }
                />
                {investor.name}
              </label>
            ))}
          </div>
          <p className="subtle-note">
            Employee confirmation only. AgentDesk does not test Google Drive permissions.
          </p>
        </fieldset>
      )}
      <details className="source-details">
        <summary>Acquisition and transaction context</summary>
        <div className="form-grid">
          <label>
            Upstream seller / wholesaler
            <input
              value={form.upstreamParty}
              onChange={(event) => set('upstreamParty', event.target.value)}
              maxLength={300}
            />
          </label>
          <label>
            Upstream stage
            <input
              value={form.upstreamStage}
              onChange={(event) => set('upstreamStage', event.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Downstream investor-sale stage
            <input
              value={form.downstreamStage}
              onChange={(event) => set('downstreamStage', event.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Closing structure
            <select
              value={form.closingStructure}
              onChange={(event) => set('closingStructure', event.target.value)}
            >
              {['unspecified', 'single', 'double', 'same_day'].map((value) => (
                <option key={value} value={value}>
                  {readable(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Closing date
            <input
              type="datetime-local"
              value={form.closingAt}
              onChange={(event) => set('closingAt', event.target.value)}
            />
          </label>
        </div>
      </details>
      {localError && (
        <p className="error-text qualification-error" role="alert">
          {localError}
        </p>
      )}
      <div className="form-footer">
        <p>
          <ShieldCheck size={13} />
          Version checked; repeated submissions are safe.
        </p>
        <button className="button primary" disabled={busy || !form.propertyId}>
          {busy ? (
            <Spinner label="Saving release…" />
          ) : form.status === 'released' ? (
            'Save & release to permitted team'
          ) : (
            'Save demo release'
          )}
        </button>
      </div>
    </form>
  );
}

export function PackagesPanel({
  data,
  intelligence,
  onChange,
  onError,
  selection,
  onInbox,
}: IntelligenceCommon & { selection?: PackageSelection; onInbox:(id:string)=>void }) {
  const [investorId, setInvestorId] = useState(selection?.investorId || '');
  const [releaseId, setReleaseId] = useState(selection?.releaseId || '');
  const [channel, setChannel] = useState<DealPackage['channel']>('email');
  const initialPackage = intelligence.packages.find((item) => item.id === selection?.packageId);
  const [selectedId, setSelectedId] = useState(selection?.packageId || '');
  const [local, setLocal] = useState<DealPackage | null>(initialPackage || null);
  const [body, setBody] = useState(initialPackage?.status === 'blocked' ? '' : initialPackage?.body || '');
  const [subject, setSubject] = useState(
    initialPackage?.status === 'blocked' ? '' : initialPackage?.subject || '',
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const selected = intelligence.packages.find((item) => item.id === selectedId) || local || null;
  const open = (item: DealPackage) => {
    setSelectedId(item.id);
    setLocal(item);
    setBody(item.status === 'blocked' ? '' : item.body);
    setSubject(item.status === 'blocked' ? '' : item.subject);
    setCopied(false);
  };
  const create = async () => {
    setBusy(true);
    try {
      const item = await api<DealPackage>('/packages', { investorId, releaseId, channel });
      open(item);
      await onChange(
        item.status === 'blocked'
          ? 'Package held until eligibility is resolved'
          : 'Deal package prepared for review',
      );
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const item = await api<DealPackage>(`/packages/${selected.id}`, { body, subject }, 'PATCH');
      open(item);
      await onChange('Package edits saved. Review the latest version before approval.');
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const item = await api<DealPackage>(`/packages/${selected.id}/approve`, {});
      open(item);
      await onChange('Package reviewed and approved for manual handoff');
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const handoff = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ package: DealPackage; text: string; subject: string }>(
        `/packages/${selected.id}/handoff`,
        {},
      );
      open(result.package);
      try {
        await navigator.clipboard.writeText(
          result.subject ? `${result.subject}\n\n${result.text}` : result.text,
        );
        setCopied(true);
        await onChange('Copied for your manual handoff. Nothing was sent.');
      } catch {
        await onChange('Manual handoff prepared. Select and copy the reviewed text below. Nothing was sent.');
      }
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const dirty = selected ? body !== selected.body || subject !== selected.subject : false;
  return (
    <>
      <PageHeading
        eyebrow="THE RIGHT DETAILS, READY FOR REVIEW"
        title="Make the follow-through easier."
        description="Prepare a property message, check eligibility, and continue in Inbox or copy it for manual handoff."
        action={<Badge tone="amber">Reviewed outreach · Never auto-sent</Badge>}
      />
      <div className="package-layout">
        <div className="intelligence-stack">
          <Panel>
            <SectionHead title="Prepare a deal package" aside={<Package size={19} />} />
            <form
              className="intelligence-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label>
                Investor
                <select value={investorId} onChange={(event) => setInvestorId(event.target.value)} required>
                  <option value="">Choose an investor</option>
                  {data.investors.map((investor) => (
                    <option value={investor.id} key={investor.id}>
                      {investor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Released property
                <select value={releaseId} onChange={(event) => setReleaseId(event.target.value)} required>
                  <option value="">Choose a release</option>
                  {intelligence.releases
                    .filter((release) => release.status === 'released')
                    .map((release) => (
                      <option value={release.id} key={release.id}>
                        {release.property.address} · v{release.version}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Message format
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as DealPackage['channel'])}
                >
                  <option value="email">Email draft</option>
                  <option value="personal_text">Personal text · copy</option>
                  <option value="imessage">iMessage · copy</option>
                  <option value="sms">SMS draft</option>
                  <option value="slack">Slack format · copy only</option>
                </select>
              </label>
              <p className="subtle-note">
                Local demo templates for reviewed investor outreach. Employee Slack and SMS conversations are managed in Settings.
              </p>
              <button className="button primary full-width" disabled={busy || !investorId || !releaseId}>
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    <Sparkles size={16} />
                    Check eligibility & prepare
                  </>
                )}
              </button>
            </form>
          </Panel>
          <Panel>
            <SectionHead title="Saved packages" aside={<Badge>{intelligence.packages.length}</Badge>} />
            {intelligence.packages.length ? (
              <div className="package-history">
                {intelligence.packages.map((item) => (
                  <button
                    className={selected?.id === item.id ? 'selected' : ''}
                    key={item.id}
                    onClick={() => open(item)}
                  >
                    <span>
                      <strong>
                        {data.investors.find((investor) => investor.id === item.investorId)?.name ||
                          'Permitted investor'}
                      </strong>
                      <small>
                        {readable(item.channel)} · {day(item.createdAt)}
                      </small>
                    </span>
                    <Badge
                      tone={
                        item.status === 'blocked'
                          ? 'amber'
                          : item.status === 'approved' || item.status === 'handed_off'
                            ? 'green'
                            : 'neutral'
                      }
                    >
                      {readable(item.status)}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">Your prepared messages will stay here.</p>
            )}
          </Panel>
          {data.actor.role === 'manager' && (
            <TemplateManager intelligence={intelligence} onChange={onChange} />
          )}
        </div>
        <Panel className="package-preview">
          {!selected ? (
            <EmptyState
              icon={<Package size={30} />}
              title="A personal message, with the details that matter."
              description="Choose a released property and investor. AgentDesk checks the recipient’s eligibility before including restricted details."
            />
          ) : (
            <div className="intelligence-stack">
              <SectionHead
                title="Review the exact message"
                aside={
                  <Badge tone={selected.status === 'blocked' ? 'amber' : 'green'}>
                    {readable(selected.status)}
                  </Badge>
                }
              />
              <p className="subtle-note">
                {data.investors.find((investor) => investor.id === selected.investorId)?.name ||
                  'Permitted investor'}{' '}
                · {readable(selected.channel)} · Release v{selected.releaseVersion}
              </p>
              {selected.status === 'blocked' ? (
                <div className="eligibility-block">
                  <LockKeyhole size={28} />
                  <h3>Disclosure eligibility needs attention.</h3>
                  <p>Restricted property details and copy controls remain unavailable.</p>
                  <Points items={selected.eligibilityReasons} />
                  <Points items={selected.missing} />
                  <p className="subtle-note">
                    Resolve the evidence with your manager, then prepare a new package.
                  </p>
                </div>
              ) : (
                <>
                  {selected.missing.length > 0 && (
                    <div className="intelligence-alert">
                      <strong>Review before sharing</strong>
                      <Points items={selected.missing} />
                    </div>
                  )}
                  <label>
                    Subject
                    <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                      <option value={selected.subject}>{selected.subject || 'No subject'}</option>
                      {selected.subject !== 'Property details for review' && (
                        <option value="Property details for review">Property details for review</option>
                      )}
                      {selected.subject && <option value="">No subject</option>}
                    </select>
                  </label>
                  <p className="subtle-note">
                    Keep sourced facts intact. You may remove or reorder complete message lines; revise
                    property facts in the release and prepare a new package.
                  </p>
                  <label>
                    Message
                    <textarea
                      className="package-body"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      rows={15}
                      maxLength={12000}
                    />
                  </label>
                  <p className="subtle-note">
                    Template {selected.templateId} · Disclosure version {selected.disclosureVersion} · Demo
                    content
                  </p>
                  <div className="intelligence-actions">
                    {dirty ? (
                      <button
                        className="button primary"
                        disabled={busy || !body.trim()}
                        onClick={() => void save()}
                      >
                        Save edited draft
                      </button>
                    ) : selected.status === 'draft' ? (
                      <button className="button primary" disabled={busy} onClick={() => void approve()}>
                        <ShieldCheck size={15} />
                        Approve reviewed package
                      </button>
                    ) : (
                      <button className="button primary" disabled={busy} onClick={() => void handoff()}>
                        {busy ? (
                          <Spinner />
                        ) : (
                          <>
                            <Clipboard size={15} />
                            {copied ? 'Copy again' : 'Copy for manual handoff'}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {!dirty&&['email','sms'].includes(selected.channel)&&<PackageInboxPreparation key={`${selected.id}:${selected.updatedAt}`} packageId={selected.id} onInbox={onInbox}/>}
                  <div className="handoff-status">
                    <ShieldCheck size={16} />
                    <p>
                      <strong>
                        {copied
                          ? 'Copied. Nothing sent.'
                          : selected.status === 'handed_off'
                            ? 'Handoff prepared. Delivery not recorded.'
                            : 'You control the final handoff.'}
                      </strong>
                      <small>Copying or preparing a message is not proof of delivery.</small>
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

export function DebriefPanel({
  data,
  intelligence,
  onChange,
  onError,
  onReview,
  onVoice,
  onPackage,
  selection,
  initialSummary,
}: IntelligenceCommon & {
  onReview: () => void;
  onVoice: () => void;
  onPackage: (selection: PackageSelection) => void;
  selection?: DebriefSelection;
  initialSummary?: NoteSummary | null;
}) {
  const initialDebrief = intelligence.debriefs.find((item) => item.id === selection?.debriefId);
  const [mode, setMode] = useState<'recap' | 'transcript'>(initialSummary ? 'transcript' : 'recap');
  const [recap, setRecap] = useState('');
  const [investorId, setInvestorId] = useState(selection?.investorId || initialDebrief?.investorId || '');
  const [propertyId, setPropertyId] = useState(selection?.propertyId || initialDebrief?.propertyId || '');
  const [debrief, setDebrief] = useState<Debrief | null>(initialDebrief || null);
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<DebriefProposal | null>(null);
  const capture = async () => {
    setBusy(true);
    try {
      const result = await api<Debrief>('/debriefs', {
        recap,
        investorId: investorId || undefined,
        propertyId: propertyId || undefined,
      });
      setDebrief(result);
      setPrepared(null);
      if (result.investorId) setInvestorId(result.investorId);
      if (result.propertyId) setPropertyId(result.propertyId);
      await onChange('Debrief captured. Review the proposed facts and record links.');
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const propose = async () => {
    if (!debrief) return;
    setBusy(true);
    try {
      const result = await api<DebriefProposal>(`/debriefs/${debrief.id}/propose`, {
        investorId: investorId || undefined,
        propertyId: propertyId || undefined,
        createFollowUp,
      });
      setPrepared(result);
      setDebrief(result.debrief);
      await onChange('Debrief changes prepared for your review');
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="OFF THE PHONE. ON TO THE NEXT STEP."
        title="A quick recap. Less admin."
        description="Tell Copilot what happened. Keep the useful details, review the changes, and follow through."
        action={
          <button className="button secondary" onClick={onVoice}>
            <AudioLines size={17} />
            Debrief with Copilot
          </button>
        }
      />
      <div className="tab-bar">
        <button className={mode === 'recap' ? 'active' : ''} onClick={() => setMode('recap')}>
          <FileText size={16} />
          Post-call recap
        </button>
        <button className={mode === 'transcript' ? 'active' : ''} onClick={() => setMode('transcript')}>
          Authorized transcript
        </button>
      </div>
      {mode === 'transcript' ? (
        <NotesPanel
          embedded
          data={data}
          onChange={onChange}
          onError={onError}
          onReview={onReview}
          initialSummary={initialSummary}
        />
      ) : (
        <div className="notes-layout">
          <div className="intelligence-stack">
            <Panel>
              <SectionHead title="What did you learn?" aside={<Badge tone="cyan">Post-call debrief</Badge>} />
              <form
                className="intelligence-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void capture();
                }}
              >
                <p className="panel-description">
                  Use your own recap after a personal phone call. AgentDesk does not record cellular calls.
                </p>
                <label>
                  Call recap
                  <textarea
                    className="debrief-input"
                    value={recap}
                    onChange={(event) => setRecap(event.target.value)}
                    minLength={20}
                    maxLength={30000}
                    required
                    rows={8}
                    placeholder="I just spoke to Mike about the Marietta property. He wants cosmetic rehabs under $250,000, asked for photos, and wants a follow-up tomorrow…"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Investor (optional)
                    <select value={investorId} onChange={(event) => setInvestorId(event.target.value)}>
                      <option value="">Let Copilot identify</option>
                      {data.investors.map((investor) => (
                        <option value={investor.id} key={investor.id}>
                          {investor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Property (optional)
                    <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                      <option value="">No property / identify from recap</option>
                      {data.properties.map((property) => (
                        <option value={property.id} key={property.id}>
                          {property.address}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="button primary" disabled={busy || recap.trim().length < 20}>
                  {busy ? (
                    <Spinner label="Organizing your recap…" />
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Turn recap into next steps
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setRecap(
                      'I just spoke to Mike Bennett about 123 Example Street. He is buying cash, wants light rehab properties in Cobb County under $250,000, and is actively buying. He asked for the property details and photo link. I promised to call him tomorrow.',
                    );
                    setInvestorId('');
                    setPropertyId('');
                  }}
                >
                  Use fictional sample
                  <ArrowRight size={12} />
                </button>
              </form>
            </Panel>
            {intelligence.debriefs.length > 0 && (
              <Panel>
                <SectionHead title="Recent debriefs" />
                {intelligence.debriefs.slice(0, 5).map((item) => (
                  <button
                    className="debrief-history"
                    key={item.id}
                    onClick={() => {
                      setDebrief(item);
                      setInvestorId(item.investorId || '');
                      setPropertyId(item.propertyId || '');
                      setPrepared(null);
                    }}
                  >
                    <div>
                      <strong>
                        {data.investors.find((investor) => investor.id === item.investorId)?.name ||
                          'Needs investor link'}
                      </strong>
                      <small>
                        {day(item.createdAt)} · {readable(item.status)}
                      </small>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </Panel>
            )}
          </div>
          <div className="intelligence-stack">
            {debrief ? (
              <>
                <Panel>
                  <SectionHead
                    title="Your conversation, organized"
                    aside={<Badge tone="green">Saved demo recap</Badge>}
                  />
                  <p className="summary-text">{debrief.summary.summary}</p>
                  <div className="intelligence-columns">
                    <div>
                      <h4>Proposed investor changes</h4>
                      {Object.keys(debrief.extractedChanges).length ? (
                        <dl className="criteria-list">
                          {Object.entries(debrief.extractedChanges).map(([key, value]) => (
                            <div key={key}>
                              <dt>{readable(key)}</dt>
                              <dd>{values(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="muted">No explicit structured criteria extracted.</p>
                      )}
                    </div>
                    <div>
                      <h4>Commitments and follow-through</h4>
                      <Points items={debrief.summary.commitments} />
                      <Points items={debrief.summary.suggestedTasks} />
                    </div>
                  </div>
                  <details className="source-details">
                    <summary>Review source excerpts</summary>
                    {Object.entries(debrief.sourceExcerpts).map(([field, excerpt]) => (
                      <blockquote key={field}>
                        <strong>{readable(field)}</strong>
                        <br />
                        {excerpt}
                      </blockquote>
                    ))}
                  </details>
                </Panel>
                <Panel>
                  <SectionHead title="Confirm the right records" aside={<ShieldCheck size={17} />} />
                  {debrief.ambiguities.length > 0 && (
                    <div className="intelligence-alert">
                      <strong>Clarify before preparing changes</strong>
                      <Points items={debrief.ambiguities} />
                    </div>
                  )}
                  <div className="form-grid">
                    <label>
                      Investor
                      <select
                        value={investorId}
                        onChange={(event) => setInvestorId(event.target.value)}
                        required
                      >
                        <option value="">Choose the intended investor</option>
                        {data.investors.map((investor) => (
                          <option key={investor.id} value={investor.id}>
                            {investor.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Related property
                      <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                        <option value="">No linked property</option>
                        {data.properties.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.address}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="checkbox-label debrief-followup">
                    <input
                      type="checkbox"
                      checked={createFollowUp}
                      onChange={(event) => setCreateFollowUp(event.target.checked)}
                    />
                    Create the suggested follow-up reminder
                    {debrief.suggestedFollowUpAt ? ` · ${day(debrief.suggestedFollowUpAt)}` : ''}
                  </label>
                  <p className="subtle-note">
                    CRM notes and criteria wait for approval. A selected reminder is created locally when you
                    prepare the changes.
                  </p>
                  {prepared ? (
                    <div className="intelligence-stack compact">
                      <Badge tone="green">
                        {prepared.actions.length} change{prepared.actions.length === 1 ? '' : 's'} prepared ·{' '}
                        {prepared.tasks.length} reminder{prepared.tasks.length === 1 ? '' : 's'}
                      </Badge>
                      <button className="button primary" onClick={onReview}>
                        <ShieldCheck size={15} />
                        Review proposed CRM changes
                      </button>
                      {prepared.package && (
                        <button
                          className="button secondary"
                          onClick={() => onPackage({ packageId: prepared.package!.id })}
                        >
                          <Package size={15} />
                          {prepared.package.status === 'blocked'
                            ? 'Review package eligibility'
                            : 'Review requested deal package'}
                        </button>
                      )}
                    </div>
                  ) : debrief.status === 'proposed' ? (
                    <button className="button primary" onClick={onReview}>
                      <ShieldCheck size={15} />
                      Open existing CRM proposals
                    </button>
                  ) : (
                    <button
                      className="button primary full-width"
                      disabled={busy || !investorId}
                      onClick={() => void propose()}
                    >
                      {busy ? (
                        <Spinner />
                      ) : (
                        <>
                          <ShieldCheck size={15} />
                          Prepare changes for review
                        </>
                      )}
                    </button>
                  )}
                </Panel>
                <Panel>
                  <SectionHead title="Useful questions for next time" />
                  <Points
                    items={debrief.coaching}
                    empty="Confirm the investor’s priorities at your next conversation."
                  />
                  <p className="subtle-note">Guidance from gaps in your recap; no performance rating.</p>
                </Panel>
              </>
            ) : (
              <Panel className="notes-empty">
                <div className="notes-art" aria-hidden="true">
                  <div>
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="notes-art-check">
                    <Check size={21} />
                  </span>
                </div>
                <h2>
                  Finish the call.
                  <br />
                  Keep the momentum.
                </h2>
                <p>Your recap becomes sourced criteria, a useful CRM note, and a clear follow-up.</p>
                <div className="notes-features">
                  <span>
                    <Check size={13} />
                    No phone recording needed
                  </span>
                  <span>
                    <Check size={13} />
                    Confirm ambiguous record links
                  </span>
                  <span>
                    <Check size={13} />
                    Review before CRM changes
                  </span>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SharingEditor({
  profile,
  data,
  members,
  onChange,
  onError,
}: {
  profile: InvestorIntelligence;
  data: Bootstrap;
  members: PhaseTwoState['members'];
  onChange: (message?: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [visibility, setVisibility] = useState(profile.visibility);
  const [sharedWith, setSharedWith] = useState(profile.sharedWith);
  const [ownerId, setOwnerId] = useState(profile.investor.ownerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (assign: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api(
        `/investors/${profile.investor.id}/${assign ? 'assignment' : 'sharing'}`,
        assign ? { ownerId } : { visibility, sharedWith: visibility === 'shared' ? sharedWith : [] },
      );
      await onChange(assign ? 'Relationship owner updated' : 'Relationship sharing updated');
    } catch (error) {
      setError(errorText(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="source-details">
      <summary>Manage relationship access</summary>
      <div className="intelligence-stack compact">
        <p className="subtle-note">
          Shared access allows teammates to read this relationship. Changes stay with the owner and authorized
          office managers.
        </p>
        <label>
          Who can view this relationship?
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as InvestorIntelligence['visibility'])}
          >
            <option value="owner">Owner and office manager</option>
            <option value="office">Authorized office teammates</option>
            <option value="shared">Selected teammates</option>
            <option value="organization">Organization, when policy allows</option>
          </select>
        </label>
        {visibility === 'shared' && (
          <div className="audience-members">
            {members
              .filter((member) => member.id !== profile.investor.ownerId)
              .map((member) => (
                <label className="checkbox-label" key={member.id}>
                  <input
                    type="checkbox"
                    checked={sharedWith.includes(member.id)}
                    onChange={(event) =>
                      setSharedWith((current) =>
                        event.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id),
                      )
                    }
                  />
                  {member.name}
                </label>
              ))}
          </div>
        )}
        <button className="button secondary" disabled={busy} onClick={() => void save(false)}>
          Save relationship access
        </button>
        {data.actor.role === 'manager' && (
          <>
            <label>
              Relationship owner
              <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {readable(member.role)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={busy || ownerId === profile.investor.ownerId}
              onClick={() => void save(true)}
            >
              Assign selected owner
            </button>
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

function TemplateManager({
  intelligence,
  onChange,
}: {
  intelligence: PhaseTwoState;
  onChange: (message?: string) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState<string>();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');
  const [intro, setIntro] = useState('Here are the property details we discussed.');
  const [closing, setClosing] = useState('Let me know if you would like to talk through the next step.');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edit = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const templates =
        await api<
          { id: string; name: string; channel: string; intro: string; closing: string; status: string }[]
        >('/templates');
      const template = templates.find((item) => item.id === id);
      if (!template) throw new Error('Template no longer available.');
      setTemplateId(id);
      setName(template.name);
      setChannel(template.channel);
      setIntro(template.intro);
      setClosing(template.closing);
      setApproved(template.status === 'demo_approved');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/templates', {
        ...(templateId ? { id: templateId } : {}),
        name,
        channel,
        intro,
        closing,
        approved,
      });
      setTemplateId(undefined);
      setName('');
      setApproved(false);
      await onChange('Local demo template saved');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <details>
        <summary className="intelligence-disclosure-title">Manage demo templates</summary>
        <div className="intelligence-stack compact">
          <p className="subtle-note">
            Manager-reviewed local copy. These templates are not approved New Western corporate language.
          </p>
          {intelligence.templates
            .filter((template) => !template.id.startsWith('demo-'))
            .map((template) => (
              <div className="template-list-item" key={template.id}>
                <strong>{template.name}</strong>
                <small>
                  {readable(template.channel)} · {readable(template.status)}
                </small>
                <button className="text-link" disabled={busy} onClick={() => void edit(template.id)}>
                  Edit template
                  <ArrowRight size={12} />
                </button>
              </div>
            ))}
          <form
            className="intelligence-stack compact"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {templateId && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setTemplateId(undefined);
                  setName('');
                  setApproved(false);
                }}
              >
                Cancel edit / create a new template
              </button>
            )}
            <label>
              Template name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label>
              Format
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                {['email', 'personal_text', 'imessage', 'sms', 'slack'].map((value) => (
                  <option key={value} value={value}>
                    {readable(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Opening line
              <textarea
                value={intro}
                onChange={(event) => setIntro(event.target.value)}
                maxLength={400}
                rows={3}
              />
            </label>
            <label>
              Closing line
              <textarea
                value={closing}
                onChange={(event) => setClosing(event.target.value)}
                maxLength={400}
                rows={3}
              />
            </label>
            <p className="subtle-note">
              Use introductory language. Property facts, prices and links come from the authorized release.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={approved}
                onChange={(event) => setApproved(event.target.checked)}
              />
              Approve this copy for local demo packages
            </label>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button className="button secondary" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : 'Save demo template'}
            </button>
          </form>
        </div>
      </details>
    </Panel>
  );
}

export function OwnershipPolicyPanel({ onChange }: { onChange: (message?: string) => Promise<void> }) {
  const [policy, setPolicy] = useState<{
    organizationVisibility: boolean;
    crossOfficeSharing: boolean;
    managerAssignment: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api<NonNullable<typeof policy>>('/ownership-policy')
      .then((value) => {
        if (active) setPolicy(value);
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/ownership-policy', policy, 'PATCH');
      await onChange('Local relationship-access policy saved');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="ownership-policy">
      <SectionHead
        title="Relationship access policy"
        aside={<Badge tone="amber">Manager · Local demo</Badge>}
      />
      <p className="panel-description">
        Configure the local concept’s access rules. These are configurable assumptions, not confirmed New
        Western corporate policy.
      </p>
      {policy ? (
        <form
          className="intelligence-stack compact"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={policy.organizationVisibility}
              onChange={(event) => setPolicy({ ...policy, organizationVisibility: event.target.checked })}
            />
            Allow explicitly shared organization-wide relationships
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={policy.crossOfficeSharing}
              onChange={(event) => setPolicy({ ...policy, crossOfficeSharing: event.target.checked })}
            />
            Allow explicitly selected teammates in other offices
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={policy.managerAssignment}
              onChange={(event) => setPolicy({ ...policy, managerAssignment: event.target.checked })}
            />
            Allow office managers to reassign relationship ownership
          </label>
          <button className="button secondary" disabled={busy}>
            {busy ? <Spinner /> : 'Save access policy'}
          </button>
        </form>
      ) : (
        !error && <Spinner label="Loading access policy…" />
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
