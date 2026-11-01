import {emptyOpportunity} from '../lib/opportunity-contracts';
import {demoActor,getDb,now} from './db';
import {featureAccess} from './billing';
import {previewOpportunity,saveOpportunity} from './opportunities';
import {mutateHandoff} from './handoffs';

/** Explicit, additive fictional setup. Never reset employee edits or renew access on restart. */
export function prepareRoleDemoScenario():boolean {
 if(process.env.AGENTDESK_DEMO!=='true')throw new Error('Role scenario requires explicit demo mode.');
 const db=getDb(),marker='gm-acquisition-followthrough-v1';
 if(db.prepare('SELECT 1 FROM demo_scenarios WHERE id=?').get(marker))return false;
 const acquisition=demoActor('acquisitions'),manager=demoActor('manager');
 if(!featureAccess(acquisition,'acquisition-lead').allowed||!featureAccess(manager,'team-performance').allowed)return false;
 return db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM demo_scenarios WHERE id=?').get(marker))return false;
  const input={...emptyOpportunity,address:'456 Preview Lane',city:'Marietta',county:'Cobb',state:'GA',propertyType:'Single-family',submission:{...emptyOpportunity.submission,wholesaler:'Fictional Peach State Wholesaler',sourceReference:'demo:gm-submission-v1 · fictional email summary',reportedOn:now().slice(0,10),askingPrice:210000,repairEstimate:45000},accessNotes:'Fictional source has not yet supplied access arrangements.',reviewNote:'Demonstration intake: resolve repair scope and access before supported screening.'};
  const preview=previewOpportunity(acquisition,{id:null,expectedVersion:0,input});
  const opportunity=saveOpportunity(acquisition,{id:null,expectedVersion:0,input,reviewReference:preview.reviewReference,eventKey:marker+'-intake'}).opportunity;
  const assigned=mutateHandoff(manager,opportunity.id,{action:'assign',assignedTo:acquisition.id,nextAction:'Obtain the fictional repair scope, estimate source and walkthrough arrangements.',dueAt:new Date(Date.now()+86400000).toISOString(),expectedVersion:0,expectedReleaseVersion:1,eventKey:marker+'-assign'});
  const acknowledged=mutateHandoff(acquisition,opportunity.id,{action:'acknowledge',expectedVersion:assigned.record!.version,expectedReleaseVersion:1,eventKey:marker+'-acknowledge'});
  mutateHandoff(acquisition,opportunity.id,{action:'report',kind:'blocked',note:'Fictional scenario: repair scope and walkthrough arrangements have not been supplied.',evidence:'demo:gm-source-followup-v1 · authored scenario, no external correspondence',expectedVersion:acknowledged.record!.version,expectedReleaseVersion:1,eventKey:marker+'-blocked'});
  db.prepare('INSERT INTO demo_scenarios VALUES(?,?)').run(marker,now());return true;
 }).immediate();
}
