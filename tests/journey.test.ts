import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../src/lib/contracts';
import type { ReleaseInput } from '../src/lib/intelligence-contracts';
import { closeDb, demoActor, getDb } from '../src/server/db';
import { grantLegacyTestWorkforce } from './fixtures';
import { getInvestorJourney, recordJourneyObservation, recommendInvestorNextStep } from '../src/server/journey';
import { createDebrief } from '../src/server/debrief';
import { completeTask, createTask, getInvestor } from '../src/server/services';
import { recordCallOutcome, recordDemoDisclosure, setInvestorSharing } from '../src/server/intelligence';
import { forgetEmployeeMemory, saveEmployeeMemory } from '../src/server/memory';
import { saveRelease } from '../src/server/workflows';
import { billingPolicy, saveBillingPolicy, simulateLifecycle, subscription } from '../src/server/billing';

let actor: Actor, manager: Actor, acquisitions: Actor;
const other: Actor = {id:'user-other', name:'Casey Sample', organizationId:'org-isolation', officeId:'office-other', role:'dispositions'};
const savannah: Actor = {id:'user-savannah', name:'Robin Sample', organizationId:'org-demo', officeId:'office-savannah', role:'dispositions'};
const releaseInput = (changes: Partial<ReleaseInput> = {}): ReleaseInput => ({
  propertyId:'property-maple', status:'released', source:'Fictional acquisition email supplied by employee', eventKey:'release-one',
  propertyType:'Single-family', description:'Fictional renovation opportunity.', notes:'Review supplied assumptions.',
  mediaUrl:'https://drive.google.com/drive/folders/demo-only', mediaAccess:'public_confirmed', arv:null, repairEstimate:null,
  economicsSource:'', showingInstructions:'Arrange a demo walkthrough.', authorizedUserIds:['user-alex'], upstreamParty:'Fictional seller',
  upstreamStage:'Under review', downstreamStage:'Released for review', closingStructure:'double', closingAt:null, ...changes,
});
const report = (text = 'Mike says uncertain repair costs are preventing another property review.') => recordJourneyObservation(actor, {
  investorId:'investor-mike', kind:'objection', text, eventKey:'reported-objection',
});
beforeEach(() => {
  closeDb(); vi.stubEnv('AGENTDESK_DB_PATH', ':memory:'); vi.stubEnv('OPENAI_API_KEY', '');
  actor = demoActor(); manager = demoActor('manager'); acquisitions = demoActor('acquisitions'); grantLegacyTestWorkforce();
});
afterEach(() => { closeDb(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('sourced investor journey', () => {
  it('keeps reviewed demo criteria, employee testimony and unreviewed extractions distinct without a canonical CRM write', () => {
    const before = getInvestor(actor, 'investor-mike');
    const observation = report();
    const debrief = createDebrief(actor, {investorId:'investor-mike', recap:'Mike said the repairs may cost too much. I promised to review the estimate before following up.'});
    const journey = getInvestorJourney(actor, 'investor-mike');
    expect(journey.buyBoxes[0].provenance.reviewStatus).toBe('approved');
    expect(journey.evidence.find(item => item.kind === 'buy_box')?.verification).toBe('seeded_demo');
    expect(journey.evidence.find(item => item.sourceRecordId === observation.id)).toMatchObject({verification:'employee_reported', recordedAt:observation.recordedAt});
    expect(journey.evidence.find(item => item.sourceRecordId === debrief.id)).toMatchObject({verification:'unreviewed_extraction', recordedAt:debrief.createdAt});
    expect(journey.openIssues.map(item => item.id)).toEqual([observation.id]);
    expect(getInvestor(actor, 'investor-mike')).toEqual(before);
    expect(getDb().prepare('SELECT count(*) n FROM proposed_actions').get()).toEqual({n:0});
    expect(JSON.stringify(journey)).not.toMatch(/passed (?:on )?(?:the last )?two/i);
  });

  it('keeps personal debriefs and tasks private from a manager while sharing explicit journey observations', () => {
    const observation = report();
    const debrief = createDebrief(actor, {investorId:'investor-mike', recap:'Mike discussed a private employee conversation about a potential repair concern.'});
    const personal = createTask(actor, {investorId:'investor-mike', title:'Private employee planning task'});
    const journey = getInvestorJourney(manager, 'investor-mike');
    expect(journey.observations.map(item => item.id)).toContain(observation.id);
    expect(journey.evidence.map(item => item.sourceRecordId)).not.toContain(debrief.id);
    expect(journey.evidence.map(item => item.sourceRecordId)).not.toContain(personal.id);
    expect(JSON.stringify(journey)).not.toContain('private employee conversation');
  });

  it('requires a real property reference for passes and deduplicates considered properties without claiming a pass count', () => {
    expect(() => recordJourneyObservation(actor, {investorId:'investor-mike', kind:'property_pass', text:'Passed on an unnamed property', eventKey:'missing-property'})).toThrow('Select the property');
    const pass = recordJourneyObservation(actor, {investorId:'investor-mike', kind:'property_pass', propertyId:'property-maple', text:'Employee reports Mike passed because repair scope was unclear.', eventKey:'first-pass'});
    recordJourneyObservation(actor, {investorId:'investor-mike', kind:'objection', propertyId:'property-maple', text:'Repair scope still needs clarification.', eventKey:'same-property'});
    const journey = getInvestorJourney(actor, 'investor-mike');
    expect(journey.consideredProperties).toHaveLength(1);
    expect(journey.consideredProperties[0]).toMatchObject({propertyId:'property-maple', status:'pass_reported'});
    recordJourneyObservation(actor, {investorId:'investor-mike', kind:'resolved', resolvesId:pass.id, text:'The reason for that pass has now been reviewed.', eventKey:'resolved-pass'});
    expect(getInvestorJourney(actor, 'investor-mike').consideredProperties[0].status).toBe('pass_reported');
  });

  it('enforces tenant, office, investor ownership, role and current property audience on every observation read or write', () => {
    expect(() => getInvestorJourney(other, 'investor-mike')).toThrow('not found');
    expect(() => getInvestorJourney(savannah, 'investor-mike')).toThrow('not found');
    expect(() => recordJourneyObservation(acquisitions, {investorId:'investor-mike', kind:'preference', text:'A preference', eventKey:'bad-role'})).toThrow('Your role');
    setInvestorSharing(manager, 'investor-mike', {visibility:'office', sharedWith:[]});
    expect(() => recordJourneyObservation(acquisitions, {investorId:'investor-mike', kind:'objection', text:'A concern', eventKey:'shared-write'})).toThrow();
    const observation = recordJourneyObservation(actor, {investorId:'investor-mike', kind:'objection', propertyId:'property-maple', text:'Restricted property repair information', eventKey:'property-sourced'});
    const release = saveRelease(acquisitions, releaseInput());
    expect(getInvestorJourney(actor, 'investor-mike').observations.map(item => item.id)).toContain(observation.id);
    saveRelease(acquisitions, releaseInput({eventKey:'restricted', expectedVersion:release.version, authorizedUserIds:[]}));
    const after = getInvestorJourney(actor, 'investor-mike');
    expect(after.observations).toEqual([]);
    expect(after.consideredProperties).toEqual([]);
    expect(JSON.stringify(after)).not.toContain('Restricted property');
    expect(() => recordJourneyObservation(actor, {investorId:'investor-mike', kind:'resolved', resolvesId:observation.id, text:'Resolve the restricted detail', eventKey:'invalid-resolution'})).toThrow('not found');
    expect(() => recommendInvestorNextStep(actor, 'investor-mike', 'property-maple')).toThrow('not found');
  });

  it('deduplicates exact event retries, rejects changed retries and preserves resolution provenance', () => {
    const observation = report();
    expect(report().id).toBe(observation.id);
    expect(() => report('Different objection')).toThrow('already used');
    const resolution = recordJourneyObservation(actor, {investorId:'investor-mike', kind:'resolved', resolvesId:observation.id, text:'Correction: Mike has reviewed the breakdown and says this concern is resolved.', eventKey:'correction'});
    const journey = getInvestorJourney(actor, 'investor-mike');
    expect(journey.openIssues).toEqual([]);
    expect(journey.observations.find(item => item.id === observation.id)).toMatchObject({status:'resolved', resolvedById:resolution.id, text:observation.text});
    expect(() => recordJourneyObservation(actor, {investorId:'investor-mike', kind:'resolved', resolvesId:observation.id, text:'Another resolution', eventKey:'repeat-resolution'})).toThrow('already resolved');
    expect(() => recordJourneyObservation(actor, {investorId:'investor-sarah', kind:'resolved', resolvesId:observation.id, text:'Wrong investor', eventKey:'wrong-investor'})).toThrow('not found');
  });

  it('allows shared read access without granting another employee write permission or private task access', () => {
    getDb().prepare('INSERT INTO users VALUES(?,?)').run('user-blake', 'Blake Demo');
    getDb().prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(actor.organizationId, actor.officeId, 'user-blake', 'dispositions');
    const blake: Actor = {...actor, id:'user-blake', name:'Blake Demo'};
    const observation = report();
    expect(() => getInvestorJourney(blake, 'investor-mike')).toThrow('not found');
    setInvestorSharing(manager, 'investor-mike', {visibility:'shared', sharedWith:[blake.id]});
    const shared = getInvestorJourney(blake, 'investor-mike');
    expect(shared.observations.map(item => item.id)).toContain(observation.id);
    expect(shared.commitments).toEqual([]);
    expect(() => recordJourneyObservation(blake, {investorId:'investor-mike', kind:'resolved', resolvesId:observation.id, text:'A shared-reader resolution', eventKey:'unauthorized-resolution'})).toThrow('read-only');
    expect(() => getInvestorJourney({...blake, role:'manager'}, 'investor-mike')).toThrow('identity');
  });
});

describe('relationship-specific next action and saved style', () => {
  it('learns a new concern, changes the next action and stops using it after an explicit correction', () => {
    const before = recommendInvestorNextStep(actor, 'investor-mike');
    expect(before.action.kind).toBe('fulfill_commitment');
    const observation = report();
    const learned = recommendInvestorNextStep(actor, 'investor-mike');
    expect(learned.action.kind).toBe('resolve_objection');
    expect(learned.action.title).toContain('repair-cost');
    expect(learned.why.join(' ')).toContain(observation.id);
    expect(learned.draft).toContain('cost breakdown');
    expect(learned.draft).not.toMatch(/attached|I (?:have|sent)|guarantee|will send|last two/i);
    recordJourneyObservation(actor, {investorId:'investor-mike', kind:'resolved', resolvesId:observation.id, text:'Mike says the repair concern is resolved after reviewing the scope.', eventKey:'resolved'});
    const corrected = recommendInvestorNextStep(actor, 'investor-mike');
    expect(corrected.action.kind).toBe('fulfill_commitment');
    expect(corrected.draft).not.toContain('repair');
    expect(corrected.evidence.find(item => item.sourceRecordId === observation.id)?.label).toContain('resolved');
  });

  it('applies a saved style correction on the next draft, honors phrase exclusions and forgets it on request', () => {
    report();
    saveEmployeeMemory(actor, {tone:'warm', length:'detailed', avoidPhrases:['amazing opportunity']});
    const warm = recommendInvestorNextStep(actor, 'investor-mike');
    saveEmployeeMemory(actor, {tone:'direct', length:'concise', avoidPhrases:['I hope your week is going well', 'amazing opportunity']});
    const direct = recommendInvestorNextStep(actor, 'investor-mike');
    expect(direct.draft).toMatch(/^Mike,/);
    expect(direct.draft!.length).toBeLessThan(warm.draft!.length);
    expect(direct.draft).not.toContain('I hope');
    expect(direct.preferencesUsed).toMatchObject({tone:'direct', length:'concise', version:2});
    expect(direct.action.kind).toBe(warm.action.kind);
    forgetEmployeeMemory(actor);
    const forgotten = recommendInvestorNextStep(actor, 'investor-mike');
    expect(forgotten.preferencesUsed).toMatchObject({tone:null, length:null, avoidPhrases:[], version:3});
    expect(forgotten.draft).toMatch(/^Hi Mike,/);
  });

  it('blocks contradictory phrase preferences instead of stripping qualifications from the draft', () => {
    report(); saveEmployeeMemory(actor, {avoidPhrases:['if available']});
    const next = recommendInvestorNextStep(actor, 'investor-mike');
    expect(next.draft).toBeNull();
    expect(next.draftEligibility.allowed).toBe(false);
    expect(next.draftEligibility.reasons.join(' ')).toContain('phrase preference');
  });

  it('respects a paused relationship before an objection, property promotion or open task', () => {
    report(); recordCallOutcome(actor, 'investor-mike', {outcome:'paused', notes:'Employee reports Mike asked to pause updates.'});
    const next = recommendInvestorNextStep(actor, 'investor-mike');
    expect(next.action.kind).toBe('confirm_timing');
    expect(next.draft).toContain('pause opportunity updates');
  });

  it('does not turn a completed task or an unreviewed recap into a confirmed customer outcome', () => {
    completeTask(actor, 'task-mike');
    const debrief = createDebrief(actor, {investorId:'investor-mike', recap:'Employee recap: Mike might be concerned about repairs but we did not confirm whether that was his objection.'});
    const next = recommendInvestorNextStep(actor, 'investor-mike');
    expect(next.action.kind).toBe('clarify_qualification');
    expect(next.evidence.find(item => item.sourceRecordId === debrief.id)?.verification).toBe('unreviewed_extraction');
    expect(getInvestorJourney(actor, 'investor-mike').completedTasks.map(task => task.id)).toContain('task-mike');
    expect(next.unknowns.join(' ')).toContain('unreviewed');
  });

  it('requires core for reads/writes, and the relationship specialist for recommendations only', () => {
    getDb().prepare('DELETE FROM billing_trials WHERE organization_id=? AND user_id=?').run(actor.organizationId, actor.id);
    expect(getInvestorJourney(actor, 'investor-mike').investorId).toBe('investor-mike');
    report();
    const policy=billingPolicy(manager);policy.restricted=['investor-relationship'];saveBillingPolicy(manager,policy);
    expect(() => recommendInvestorNextStep(actor, 'investor-mike')).toThrow('Restricted');
    simulateLifecycle(actor, {action:'cancel_now', expectedVersion:subscription(actor).version, eventKey:'cancel-core'});
    expect(() => getInvestorJourney(actor, 'investor-mike')).toThrow(/active .*subscription/i);
    expect(() => recordJourneyObservation(actor, {investorId:'investor-mike', kind:'preference', text:'New preference', eventKey:'inactive-core'})).toThrow(/active .*subscription/i);
  });

  it('uses safe equivalent property gates without requiring buyer-matchmaker or deal-marketing', () => {
    const release = saveRelease(acquisitions, releaseInput());
    getDb().prepare('DELETE FROM billing_trials WHERE organization_id=? AND user_id=?').run(actor.organizationId, actor.id);
    const policy=billingPolicy(manager);policy.restricted=['buyer-matchmaker','deal-marketing'];saveBillingPolicy(manager,policy);
    report();
    const next = recommendInvestorNextStep(actor, 'investor-mike', 'property-maple');
    expect(next.draftEligibility.allowed).toBe(true);
    expect(next.draft).toContain(release.property.address);
    expect(next.unknowns.join(' ')).toContain('No repair estimate');
    expect(getDb().prepare('SELECT count(*) n FROM deal_packages').get()).toEqual({n:0});
    expect(next.deliveryStatus).toBe('not_sent');
  });

  it('reports actual property-fit conflicts without broadening the buy box or producing a pitch', () => {
    completeTask(actor, 'task-mike');
    saveRelease(acquisitions, releaseInput({propertyId:'property-oak', repairEstimate:25000, economicsSource:'Fictional unverified estimate'}));
    const before = getInvestor(actor, 'investor-mike');
    const next = recommendInvestorNextStep(actor, 'investor-mike', 'property-oak');
    expect(next.action.kind).toBe('clarify_fit');
    expect(next.why.join(' ')).toContain('Outside the recorded');
    expect(next.why.join(' ')).toContain('strategy conflicts');
    expect(next.draft).toContain('confirm your current purchase range');
    expect(next.draft).not.toMatch(/perfect|ideal|matches your criteria/i);
    expect(getInvestor(actor, 'investor-mike')).toEqual(before);
  });

  it.each(['disclosure', 'media', 'recipient', 'withdrawn', 'unreleased'] as const)('withholds the entire property-specific draft when %s gating fails', gate => {
    if (gate !== 'unreleased') saveRelease(manager, releaseInput({
      status:gate === 'withdrawn' ? 'withdrawn' : 'released', mediaAccess:gate === 'media' ? 'unverified' : gate === 'recipient' ? 'recipient_confirmed' : 'public_confirmed',
      permittedMediaInvestorIds:gate === 'recipient' ? ['investor-sarah'] : [],
    }));
    if (gate === 'disclosure') recordDemoDisclosure(manager, 'investor-mike', {status:'unknown', version:'demo-disclosure-v1', documentRef:null});
    report();
    const next = recommendInvestorNextStep(actor, 'investor-mike', 'property-maple');
    expect(next.draft).toBeNull();
    expect(next.draftEligibility.allowed).toBe(false);
    expect(next.draftEligibility.reasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(next)).not.toContain('123 Example');
    expect(next.evidence.some(item => item.kind === 'property')).toBe(false);
  });

  it('carries a previous-property objection into the next opportunity without inventing a record of another pass', () => {
    recordJourneyObservation(actor, {investorId:'investor-mike', kind:'objection', propertyId:'property-maple', text:'Mike reports the repair scope is unclear.', eventKey:'old-property-objection'});
    saveRelease(acquisitions, releaseInput({propertyId:'property-cedar', eventKey:'new-property'}));
    const next = recommendInvestorNextStep(actor, 'investor-mike', 'property-cedar');
    expect(next.action.kind).toBe('resolve_objection');
    expect(next.draft).toContain('48 Sample');
    expect(next.draft).not.toContain('123 Example');
    expect(getInvestorJourney(actor, 'investor-mike').consideredProperties).toHaveLength(1);
  });
});
