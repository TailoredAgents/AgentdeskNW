import {prepareRoleDemoScenario} from './demo-role-scenario';
import { demoActor, getDb, now } from './db';
import { grantTrial } from './billing';
import { specialists } from './registry';
import { saveRelease, composePackage } from './workflows';
import { createDebrief, proposeDebrief } from './debrief';
import { getDisclosure, recordDemoDisclosure } from './intelligence';

/** Explicit presentation setup. Normal services enforce every role, approval and trial rule. */
export function prepareDemoScenario() {
  if (process.env.AGENTDESK_DEMO !== 'true') throw new Error('Demo setup requires explicit demo mode.');
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS demo_scenarios (id TEXT PRIMARY KEY, prepared_at TEXT NOT NULL)');
  if (db.prepare('SELECT 1 FROM demo_scenarios WHERE id=?').get('monday-presentation-v1')) return {prepared:prepareRoleDemoScenario()};
  return db.transaction(() => {
    const admin = demoActor('manager'), alex = demoActor(), jordan = demoActor('acquisitions');
    for (const actor of [alex,jordan,admin]) grantTrial(admin, {
      userId:actor.id, days:14,
      features:specialists.filter(s=>s.status!=='planned'&&s.roles.includes(actor.role)).map(s=>s.id),
      allowances:{research_credits:40, voice_minutes:60, text_tokens:1000000},
    });
    // Preserve existing work; add this release only if the property has no release yet.
    let release = db.prepare("SELECT id FROM property_releases WHERE organization_id='org-demo' AND property_id='property-maple'").get() as {id:string}|undefined;
    if (!release) release = saveRelease(jordan, {
      propertyId:'property-maple', status:'released', source:'Fictional presentation scenario · acquisition team sample', eventKey:'monday-demo-maple-v1',
      propertyType:'Single-family', description:'A fictional three-bedroom Marietta renovation opportunity, prepared for the Georgia office demonstration.',
      notes:'Illustrative deal only. Use the supplied sample assumptions to explore buyer fit and follow-up.',
      mediaUrl:null, mediaAccess:'unverified', arv:325000, repairEstimate:45000,
      economicsSource:'Fictional presentation assumptions; not an appraisal or contractor estimate.',
      showingInstructions:'Arrange a sample walkthrough with the acquisitions coordinator.', authorizedUserIds:['user-alex'],
      upstreamParty:'Sample seller',upstreamStage:'Under contract — demo',downstreamStage:'Released for review',closingStructure:'unspecified',closingAt:null,
    });
    // Demonstrate both an eligible recipient and an unresolved disclosure using fictional evidence.
    const disclosure = getDisclosure(admin,'investor-mike');
    if (disclosure.status === 'unknown') recordDemoDisclosure(admin,'investor-mike',{status:'signed',version:'demo-disclosure-v1',documentRef:'demo:monday-fictional-disclosure'});
    if (!db.prepare("SELECT 1 FROM deal_packages WHERE owner_id='user-alex'").get()) composePackage(alex,{investorId:'investor-mike',releaseId:release.id,channel:'email'});
    if (!db.prepare("SELECT 1 FROM debriefs WHERE owner_id='user-alex'").get()) {
      const debrief = createDebrief(alex,{
        investorId:'investor-mike',propertyId:'property-maple',
        recap:'Fictional sample call. Mike Bennett confirmed he buys single-family fix-and-flip properties in Cobb and Cherokee counties. His budget is $180,000 to $300,000. He pays cash and can handle moderate rehab, but avoids foundation problems. He wants to buy within 30 days. He asked for the Marietta property details and repair assumptions. I will follow up tomorrow. He needs a walkthrough before making a decision.',
      });
      proposeDebrief(alex,debrief.id,{investorId:'investor-mike',propertyId:'property-maple',createFollowUp:true});
    }
    prepareRoleDemoScenario();
    db.prepare('INSERT INTO demo_scenarios VALUES(?,?)').run('monday-presentation-v1',now());
    return {prepared:true};
  }).immediate();
}
