import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Actor, Task } from '../lib/contracts';
import type { BuyerMatch, PropertyRelease } from '../lib/intelligence-contracts';
import type { EmployeeMemory } from '../lib/memory-contracts';
import type { ConsideredProperty, InvestorJourney, InvestorNextStep, JourneyEvidence, JourneyObservation, JourneyObservationInput } from '../lib/journey-contracts';
import { readInvestorRow, readProperty, writableInvestor } from './access';
import { requireFeature } from './billing';
import { AppError, audit, getDb, newId, now, requireRole, scopedRows } from './db';
import { listDebriefs } from './debrief';
import { compareProperty, getDisclosure, getInvestorIntelligence, isDisclosureReady } from './intelligence';
import { getEmployeeMemory } from './memory';
import { getRelease } from './workflows';

const id = z.string().trim().min(1).max(150);
export const journeyObservationSchema = z.object({
  investorId: id,
  kind: z.enum(['objection', 'property_pass', 'resolved', 'preference']),
  text: z.string().trim().min(3).max(2000),
  propertyId: id.nullable().optional(),
  resolvesId: id.nullable().optional(),
  eventKey: id,
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'resolved' && !value.resolvesId) ctx.addIssue({code:'custom', message:'Select the observation being resolved.', path:['resolvesId']});
  if (value.kind !== 'resolved' && value.resolvesId) ctx.addIssue({code:'custom', message:'Only a resolution may reference a previous observation.', path:['resolvesId']});
  if (value.kind === 'property_pass' && !value.propertyId) ctx.addIssue({code:'custom', message:'Select the property that was passed on.', path:['propertyId']});
});

function propertyVisible(actor: Actor, propertyId: string | null): boolean {
  if (!propertyId) return true;
  try { readProperty(actor, propertyId); return true; }
  catch (error) { if (error instanceof AppError && error.status === 404) return false; throw error; }
}

/** Relationship observations follow the investor's access policy, not the employee's private preference memory. */
function observationsFor(actor: Actor, investorId: string): JourneyObservation[] {
  const investor = readInvestorRow(actor, investorId);
  const rows = getDb().prepare('SELECT data FROM journey_observations WHERE organization_id=? AND office_id=? AND investor_id=? ORDER BY rowid DESC')
    .all(actor.organizationId, investor.office_id, investorId) as {data: string}[];
  const observations = rows.map(row => JSON.parse(row.data) as JourneyObservation).filter(item => propertyVisible(actor, item.propertyId));
  const resolutions = new Map(observations.filter(item => item.kind === 'resolved' && item.resolvesId).map(item => [item.resolvesId, item.id]));
  return observations.map(item => ({...item, status: item.kind === 'resolved' || resolutions.has(item.id) ? 'resolved' : 'open', resolvedById: resolutions.get(item.id) ?? null}));
}

/** Append employee testimony; this does not approve a CRM mutation or independently verify a customer statement. */
export function recordJourneyObservation(actor: Actor, input: JourneyObservationInput): JourneyObservation {
  requireRole(actor, ['dispositions', 'manager']);
  requireFeature(actor, 'core');
  const parsed = journeyObservationSchema.parse(input);
  writableInvestor(actor, parsed.investorId);
  const payload = {...parsed, propertyId: parsed.propertyId ?? null, resolvesId: parsed.resolvesId ?? null};
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return getDb().transaction(() => {
    const previous = getDb().prepare('SELECT data,payload_hash FROM journey_observations WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?')
      .get(actor.organizationId, actor.officeId, actor.id, parsed.eventKey) as {data:string;payload_hash:string} | undefined;
    if (previous) {
      if (previous.payload_hash !== payloadHash) throw new AppError(409, 'This observation event key was already used with different details.');
      const value = JSON.parse(previous.data) as JourneyObservation;
      if (value.propertyId) readProperty(actor, value.propertyId);
      return observationsFor(actor, value.investorId).find(item => item.id === value.id)!;
    }
    let propertyId = payload.propertyId;
    if (parsed.resolvesId) {
      const original = observationsFor(actor, parsed.investorId).find(item => item.id === parsed.resolvesId);
      if (!original) throw new AppError(404, 'The observation was not found in this investor journey.');
      if (original.status === 'resolved') throw new AppError(409, 'This observation is already resolved.');
      if (propertyId && propertyId !== original.propertyId) throw new AppError(422, 'The resolution must refer to the same property as the original observation.');
      propertyId = original.propertyId;
    }
    if (propertyId) readProperty(actor, propertyId);
    const value: JourneyObservation = {
      id: newId('journey'), investorId: parsed.investorId, kind: parsed.kind, text: parsed.text,
      propertyId, resolvesId: payload.resolvesId, recordedAt: now(), recordedBy: actor.id,
      verification: 'employee_reported', status: parsed.kind === 'resolved' ? 'resolved' : 'open', resolvedById: null,
    };
    getDb().prepare('INSERT INTO journey_observations(id,organization_id,office_id,owner_id,investor_id,property_id,resolves_id,event_key,payload_hash,data) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(value.id, actor.organizationId, actor.officeId, actor.id, value.investorId, propertyId, value.resolvesId, parsed.eventKey, payloadHash, JSON.stringify(value));
    audit(actor, 'journey.observation.recorded', value.id, {investorId:value.investorId, kind:value.kind, resolvesId:value.resolvesId});
    return value;
  }).immediate();
}

/** A source ledger, not a model-invented biography. Capture time is never presented as the date of an unverified call. */
export function getInvestorJourney(actor: Actor, investorId: string): InvestorJourney {
  requireFeature(actor, 'core');
  const intelligence = getInvestorIntelligence(actor, id.parse(investorId));
  const investor = intelligence.investor;
  const observations = observationsFor(actor, investorId);
  const buyBoxes = intelligence.buyBoxes.filter(box => box.provenance.reviewStatus === 'approved');
  const tasks = scopedRows<Task>(actor, 'tasks', true).filter(task => task.investorId === investorId);
  const commitments = tasks.filter(task => task.status === 'open').sort((a,b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const completedTasks = tasks.filter(task => task.status === 'completed');
  const debriefs = listDebriefs(actor).filter(debrief => debrief.investorId === investorId);
  const evidence: JourneyEvidence[] = [{
    id:`crm:${investorId}`, sourceRecordId:investorId, kind:'crm', label:'Current CRM record',
    text:investor.notes || 'No relationship note recorded.', recordedAt:null,
    verification:investor.synthetic ? 'seeded_demo' : 'reviewed_record', source:intelligence.relationshipSource, propertyId:null,
  }];
  for (const box of buyBoxes) evidence.push({
    id:`buy_box:${box.id}`, sourceRecordId:box.id, kind:'buy_box', label:`${box.label} · version ${box.version}`,
    text:box.provenance.statement, recordedAt:box.provenance.capturedAt,
    verification:box.provenance.verification === 'seeded_demo' ? 'seeded_demo' : 'reviewed_record', source:box.provenance.source, propertyId:null,
  });
  // A recap can contain private property details. Use the personal, currently authorized debrief service below,
  // rather than the duplicate summary on the investor's shared relationship timeline.
  for (const event of intelligence.history.filter(event => event.kind !== 'debrief')) evidence.push({
    id:`relationship:${event.id}`, sourceRecordId:event.id, kind:'relationship', label:`Recorded ${event.kind.replaceAll('_',' ')}`,
    text:event.summary, recordedAt:event.occurredAt, verification:event.kind === 'call' || event.kind === 'commitment' ? 'employee_reported' : 'reviewed_record',
    source:event.source, propertyId:null,
  });
  for (const observation of observations) evidence.push({
    id:`observation:${observation.id}`, sourceRecordId:observation.id, kind:'observation',
    label:`Employee-reported ${observation.kind.replaceAll('_',' ')}${observation.status === 'resolved' ? ' · resolved' : ''}`,
    text:observation.text, recordedAt:observation.recordedAt, verification:'employee_reported',
    source:'Explicit employee observation; not independently verified and not a canonical CRM update.', propertyId:observation.propertyId,
  });
  for (const debrief of debriefs) {
    const items = [...debrief.summary.objections.map(text => ({label:'Unreviewed possible objection',text})),
      ...debrief.summary.commitments.map(text => ({label:'Unreviewed possible commitment',text}))];
    evidence.push({id:`debrief:${debrief.id}`, sourceRecordId:debrief.id, kind:'debrief', label:'Employee recap · needs review',
      text:debrief.summary.summary, recordedAt:debrief.createdAt, verification:'unreviewed_extraction',
      source:'Employee recap capture; this is not a verified call timestamp or confirmed customer statement.', propertyId:debrief.propertyId});
    items.forEach((item,index) => evidence.push({id:`debrief:${debrief.id}:${index}`, sourceRecordId:debrief.id, kind:'debrief', ...item,
      recordedAt:debrief.createdAt, verification:'unreviewed_extraction', source:'Extracted from an employee recap; review attribution before relying on it.', propertyId:debrief.propertyId}));
  }
  for (const task of tasks) evidence.push({
    id:`task:${task.id}`, sourceRecordId:task.id, kind:'task', label:`${task.status === 'open' ? 'Open' : task.status === 'canceled' ? 'Canceled' : 'Completed'} follow-up task`, text:task.title,
    recordedAt:task.createdAt, verification:'reviewed_record', source:`Employee task record${task.dueAt ? `; due ${task.dueAt}` : '; no deadline recorded'}. Completion does not establish an investor response.`, propertyId:null,
  });
  const considered = new Map<string, ConsideredProperty>();
  const propertySources = [
    ...observations.filter(item => item.kind !== 'resolved').map(item => ({propertyId:item.propertyId, id:item.id, pass:item.kind === 'property_pass'})),
    ...debriefs.map(item => ({propertyId:item.propertyId, id:item.id, pass:false})),
  ];
  for (const source of propertySources) {
    if (!source.propertyId) continue;
    const property = readProperty(actor, source.propertyId);
    const previous = considered.get(property.id);
    considered.set(property.id, {propertyId:property.id, address:property.address, sourceIds:[...(previous?.sourceIds ?? []), source.id],
      status:source.pass || previous?.status === 'pass_reported' ? 'pass_reported' : 'mentioned'});
  }
  const openIssues = observations.filter(item => item.status === 'open' && (item.kind === 'objection' || item.kind === 'property_pass'));
  const activeBoxes = buyBoxes.filter(box => box.active);
  const unknowns: string[] = [];
  if (intelligence.currentActivity === 'unknown') unknowns.push('Current buying activity has not been confirmed.');
  if (!investor.timeframe) unknowns.push('Purchase timing has not been recorded.');
  if (!activeBoxes.length) unknowns.push('No active, reviewed buy box is available.');
  if (activeBoxes.length && !activeBoxes.some(box => box.financing.length)) unknowns.push('Funding method has not been recorded in an active buy box.');
  if (debriefs.length) unknowns.push('Recap extractions are unreviewed; they do not establish a confirmed objection, commitment or change of criteria.');
  if (observations.some(item => item.kind !== 'resolved')) unknowns.push('Journey observations are employee reports, not independently verified customer statements.');
  const criteria = activeBoxes.map(box => `${box.label}: ${box.strategies.join(' / ') || 'strategy unrecorded'}; ${[...box.counties,...box.cities].join(', ') || 'geography unrecorded'}`).join('. ');
  return {investorId, investorName:investor.name, synthetic:investor.synthetic, generatedAt:now(),
    summary:`${investor.name}. ${criteria || 'No active, reviewed buying criteria.'}. Activity: ${intelligence.currentActivity.replaceAll('_',' ')}. ${openIssues.length} unresolved employee-reported concern${openIssues.length === 1 ? '' : 's'}; ${commitments.length} open personal follow-up task${commitments.length === 1 ? '' : 's'}.`,
    activity:intelligence.currentActivity, lastOutcome:intelligence.lastOutcome, buyBoxes, observations, openIssues, commitments, completedTasks,
    consideredProperties:[...considered.values()], evidence, unknowns};
}

/** Same distribution checks as deal packages, without creating a package or requiring a second specialist purchase. */
function propertyDraftContext(actor: Actor, investorId: string, propertyId: string) {
  readProperty(actor, propertyId);
  const row = getDb().prepare('SELECT id FROM property_releases WHERE organization_id=? AND office_id=? AND property_id=?')
    .get(actor.organizationId, actor.officeId, propertyId) as {id:string} | undefined;
  const release = row ? getRelease(actor, row.id) : null;
  const reasons: string[] = [];
  if (readInvestorRow(actor, investorId).office_id !== actor.officeId) reasons.push('Property follow-up is limited to investor records in this office.');
  if (!release || release.status !== 'released') reasons.push('The property has not been released for distribution.');
  if (!isDisclosureReady(getDisclosure(actor, investorId))) reasons.push('A current, verifiable signed disclosure is required before drafting property details.');
  if (release?.mediaUrl && release.mediaAccess === 'unverified') reasons.push('Confirm media access before drafting property details.');
  if (release?.mediaUrl && release.mediaAccess === 'recipient_confirmed' && !release.permittedMediaInvestorIds?.includes(investorId)) reasons.push('Media access has not been confirmed for this investor.');
  return {release, reasons};
}

const repairConcern = (text: string) => /\b(repair|rehab|renovation|contractor|scope of work)\b/i.test(text);
function draftFor(journey: InvestorJourney, kind: InvestorNextStep['action']['kind'], repair: boolean, release: PropertyRelease | null, memory: EmployeeMemory): string {
  const name = journey.investorName.split(' ')[0];
  const property = release ? ` at ${release.property.address}` : '';
  const bodies: Record<InvestorNextStep['action']['kind'], string> = {
    confirm_timing:'Would you prefer that I pause opportunity updates? What timing would work for a future check-in?',
    resolve_objection:repair
      ? `What repair-cost detail would help you evaluate ${release ? `the property${property}` : 'the next opportunity'}? Would a verified scope and cost breakdown, followed by a walkthrough if available, help?`
      : 'What would need to be clarified before you would consider another opportunity?',
    review_pass:`What was the main reason ${release ? `the property${property}` : 'the property you reviewed'} did not work for you, and what should we look for next time?`,
    fulfill_commitment:'Has anything changed in your plans that I should account for before we continue?',
    review_observation:'Before I suggest another opportunity, what is the main question you would like us to resolve?',
    resolve_eligibility:'',
    clarify_fit:repair
      ? `Before we evaluate the property${property}, what repair-scope or cost questions would you want a verified breakdown to answer?`
      : 'Would you confirm your current purchase range, target areas and renovation limits before we consider another property?',
    clarify_qualification:'What is your current purchase timeline, and are your funding plans and buying criteria still the same?',
    review_property:`Would you like to review the property${property} against your buying criteria? We would need to confirm the remaining details before deciding whether it works for you.`,
    relationship_check_in:'Are your buying criteria and timing still the same? What would make the next opportunity useful to you?',
  };
  const concise: Partial<Record<InvestorNextStep['action']['kind'], string>> = {
    confirm_timing:'When would you like me to check in again?',
    resolve_objection:repair
      ? `Would a verified repair scope and cost breakdown help you evaluate ${release ? `the property${property}` : 'the next opportunity'}?`
      : 'What should we clarify before considering another opportunity?',
    review_pass:'What should we look for differently after the property you passed on?',
    clarify_qualification:'Have your buying timeline, funding or criteria changed?',
    relationship_check_in:'What would make the next opportunity useful to you?',
  };
  const core = memory.length === 'concise' ? concise[kind] ?? bodies[kind] : bodies[kind];
  const greeting = memory.tone === 'direct' ? `${name},` : `Hi ${name},`;
  const warmth = memory.tone === 'warm' && memory.length !== 'concise' ? ' I hope your week is going well.' : '';
  const detail = memory.length === 'detailed' ? ' Your answer will help me focus the next conversation on what matters to you.' : '';
  // Preferences cannot rewrite factual caveats. Omit optional style sentences, never subtract words from the core.
  const optional = (value: string) => memory.avoidPhrases.some(phrase => value.toLowerCase().includes(phrase.toLowerCase())) ? '' : value;
  return `${greeting}${optional(warmth)}\n\n${core}${optional(detail)}`;
}

/** Grounded next action for one relationship. No tool delivery, CRM mutation, inferred personality or model claims. */
export function recommendInvestorNextStep(actor: Actor, investorId: string, propertyId?: string | null): InvestorNextStep {
  requireRole(actor, ['dispositions', 'manager']);
  requireFeature(actor, 'investor-relationship');
  const journey = getInvestorJourney(actor, investorId);
  const memory = getEmployeeMemory(actor);
  const selectedPropertyId = propertyId ? id.parse(propertyId) : null;
  const context = selectedPropertyId ? propertyDraftContext(actor, investorId, selectedPropertyId) : {release:null, reasons:[] as string[]};
  const eligibleRelease = context.reasons.length ? null : context.release;
  const unknowns = [...journey.unknowns];
  const evidence = journey.evidence.filter(item => !selectedPropertyId || !context.reasons.length || item.propertyId !== selectedPropertyId);
  let match: BuyerMatch | undefined;
  if (eligibleRelease) {
    match = compareProperty(actor, eligibleRelease.propertyId).find(item => item.investorId === investorId);
    if (match && !journey.buyBoxes.some(box => box.id === match!.buyBoxId && box.active)) match = undefined;
    unknowns.push(...(match?.missing ?? ['No active reviewed buying criteria are available for this comparison.']));
    if (eligibleRelease.repairEstimate === null) unknowns.push('No repair estimate is recorded for the selected release. Obtain and verify a scope and cost breakdown; do not imply one is available.');
    if (eligibleRelease.arv === null) unknowns.push('No sourced after-repair value is recorded; no return or profit conclusion is supported.');
    evidence.push({id:`release:${eligibleRelease.id}:${eligibleRelease.version}`, sourceRecordId:eligibleRelease.id, kind:'property', label:`Released property · version ${eligibleRelease.version}`,
      text:`${eligibleRelease.property.address}; asking price $${eligibleRelease.property.price.toLocaleString('en-US')}. ${eligibleRelease.repairEstimate === null ? 'Repair estimate not supplied.' : 'A supplied repair estimate is recorded; independent verification is not established.'}`,
      recordedAt:eligibleRelease.updatedAt, verification:eligibleRelease.synthetic ? 'seeded_demo' : 'employee_reported', source:eligibleRelease.source, propertyId:eligibleRelease.propertyId});
  }
  // A concern raised on an earlier property still matters when considering a different one.
  const issue = journey.openIssues.find(item => item.kind === 'objection')
    ?? journey.openIssues.find(item => !selectedPropertyId || !item.propertyId || item.propertyId === selectedPropertyId)
    ?? journey.openIssues[0];
  const repair = !!issue && repairConcern(issue.text);
  let action: InvestorNextStep['action'];
  const why: string[] = [];
  if (journey.activity === 'paused') {
    action = {kind:'confirm_timing', title:'Respect the recorded pause', description:'Confirm a suitable future check-in before proposing more properties.'};
    why.push('The current activity record is paused. A property match does not override that preference.');
  } else if (issue) {
    action = issue.kind === 'property_pass'
      ? {kind:'review_pass', title:'Understand the recorded property pass', description:'Review the employee-reported reason for the pass before choosing the next opportunity.'}
      : {kind:'resolve_objection', title:repair ? 'Resolve the repair-cost concern first' : 'Address the outstanding concern first', description:repair
        ? 'Verify the concern with the investor. Request a sourced repair scope and cost breakdown from the property team; confirm walkthrough availability before offering a time.'
        : 'Confirm the employee-reported concern, obtain the missing facts and agree on a useful next step before another property pitch.'};
    why.push(`An unresolved employee-reported ${issue.kind === 'property_pass' ? 'pass' : 'objection'} remains in the journey (source ${issue.id}). It is not independently verified.`);
    if (repair) unknowns.push('A concern about repairs does not establish the actual repair scope, cost, availability of a breakdown or walkthrough access.');
  } else if (journey.commitments.length) {
    action = {kind:'fulfill_commitment', title:'Handle the open follow-up first', description:`Review and complete the recorded task: ${journey.commitments[0].title}`};
    why.push(`An open employee task remains (source ${journey.commitments[0].id}); completion and the investor’s response are not yet recorded.`);
  } else if (context.reasons.length) {
    action = {kind:'resolve_eligibility', title:'Resolve sharing requirements first', description:'Complete the release, disclosure and recipient-access checks before drafting property details.'};
    why.push(...context.reasons);
  } else if (match?.conflicts.length || eligibleRelease && !match) {
    action = {kind:'clarify_fit', title:'Clarify the buying criteria before proposing this property', description:'Review the recorded fit conflicts. Do not silently broaden the investor’s buy box.'};
    why.push(...(match?.conflicts ?? ['No active, reviewed buying criteria support a fit comparison.']));
  } else if (eligibleRelease && (match?.missing.length || eligibleRelease.repairEstimate === null)) {
    action = {kind:'clarify_fit', title:'Fill the missing property facts', description:'Verify the missing fit and repair information before suggesting the investor proceed.'};
    why.push('A preliminary criteria match cannot establish suitable economics or clear unresolved missing information.');
  } else if (eligibleRelease) {
    action = {kind:'review_property', title:'Offer a careful property review', description:'Review the released facts against the recorded buy box; confirm assumptions before any decision.'};
    why.push(...(match?.reasons ?? []));
  } else if (journey.unknowns.some(item => /timing|funding|buy box/.test(item))) {
    action = {kind:'clarify_qualification', title:'Confirm what the next opportunity needs to satisfy', description:'Clarify timing and missing buying criteria before choosing another property.'};
    why.push('The relationship record still has qualification gaps.');
  } else {
    action = {kind:'relationship_check_in', title:'Confirm the next useful step', description:'Ask whether the recorded buying criteria and timing still reflect the investor’s plans.'};
    why.push('No unresolved reported objection or personal follow-up task is recorded. Do not invent an objection or assume readiness.');
  }
  const reasons = [...context.reasons];
  const draftNeedsRepairDetail = repair || action.kind === 'clarify_fit' && eligibleRelease?.repairEstimate === null && !match?.conflicts.length;
  let draft = reasons.length ? null : draftFor(journey, action.kind, draftNeedsRepairDetail, eligibleRelease, memory);
  if (draft && memory.avoidPhrases.some(phrase => draft!.toLowerCase().includes(phrase.toLowerCase()))) {
    // Refuse a contradictory draft rather than deleting a necessary qualification or changing a factual name.
    reasons.push('A saved phrase preference conflicts with this draft. Review the wording or adjust that preference before preparing it.');
    draft = null;
  }
  return {investorId, propertyId:selectedPropertyId, generatedAt:now(), action, why, evidence, unknowns:[...new Set(unknowns)], draft,
    draftEligibility:{allowed:draft !== null, reasons, scope:selectedPropertyId ? 'property_specific' : 'relationship_only'},
    preferencesUsed:{tone:memory.tone, length:memory.length, avoidPhrases:memory.avoidPhrases, priorities:memory.priorities, version:memory.version},
    method:['Use reviewed buying criteria and current authorized records.', 'Respect a pause, unresolved employee reports and open follow-up work before a new pitch.', 'Keep unreviewed extractions and missing facts explicit.', 'Apply saved writing preferences; a human reviews any draft before sending.'],
    deliveryStatus:'not_sent', synthetic:journey.synthetic};
}
