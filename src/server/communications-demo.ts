import type {Actor} from '../lib/contracts';
import type {CommunicationAttachment,CommunicationParty,CommunicationProvider,InboxScenario,InboxScenarioId} from '../lib/communications-contracts';

export interface DemoThreadFixture {key:string;provider:CommunicationProvider;subject:string;correspondent:CommunicationParty;body:string;attachments:CommunicationAttachment[]}
const primary=(actor:Actor)=>actor.id==='user-alex'&&actor.organizationId==='org-demo'&&actor.officeId==='office-atlanta';
export function isCommunicationDemoPersona(actor:Actor){return ['org-demo:office-atlanta:user-alex','org-demo:office-atlanta:user-jordan','org-demo:office-atlanta:user-taylor','org-demo:office-savannah:user-savannah','org-isolation:office-other:user-other'].includes(`${actor.organizationId}:${actor.officeId}:${actor.id}`);}
export function demoThreadFixtures(actor:Actor):DemoThreadFixture[]{
 if(!primary(actor))return [
  {key:'mike',provider:'gmail',subject:'A question before our next conversation',correspondent:{name:'Jamie Parker',address:'jamie.parker@example.com'},body:`Hi ${actor.name.split(' ')[0]}, could we review my purchase timing before the next opportunity? This is a fictional message for your private demo mailbox.`,attachments:[]},
  {key:'sarah',provider:'outlook',subject:'Rental details to review',correspondent:{name:'Morgan Ellis',address:'morgan.ellis@example.com'},body:'Could you clarify which rental assumptions still need checking? Fictional correspondence; nothing has been verified or sent.',attachments:[]},
  {key:'david',provider:'twilio',subject:'Text conversation with Cameron',correspondent:{name:'Cameron Sample',address:'+14045550171'},body:'Could you follow up next week? This text is a fictional inbox example.',attachments:[]},
  {key:'shared',provider:'gmail',subject:'Introduction from our acquisitions team',correspondent:{name:'Demo acquisitions team',address:'team.introduction@example.com'},body:'We are reaching out from a shared mailbox. Please confirm who should be associated with this conversation. Fictional example.',attachments:[]},
  {key:'unknown',provider:'outlook',subject:'A new buyer introduction',correspondent:{name:'Avery Sample',address:'avery.sample@example.com'},body:'I would like to introduce myself and understand your process. Fictional example; no CRM profile has been created.',attachments:[]},
 ];
 return [
  {key:'mike',provider:'gmail',subject:'Repair breakdown before the next opportunity',correspondent:{name:'Mike Bennett',address:'mike@example.com'},body:'Hi Alex,\n\nI passed on the last two opportunities because the repair costs were unclear. Before we look at another property, could you help me get a line-item repair breakdown and understand what still needs a contractor’s review?\n\nI would rather resolve that first than rush into another walkthrough.\n\nMike\n\nFictional investor message for the AgentDesk demonstration.',attachments:[{id:'demo-repair-questions',name:'Repair scope questions.pdf',mimeType:'application/pdf',sizeBytes:18432,availability:'metadata_only'}]},
  {key:'sarah',provider:'outlook',subject:'Rental operating costs and next steps',correspondent:{name:'Sarah Chen',address:'sarah@example.com'},body:'Hi Alex,\n\nBefore scheduling a walkthrough, could we review the operating-cost assumptions and which figures still need verification? I am still interested in a rental acquisition within 60 days.\n\nThanks,\nSarah\n\nFictional demonstration correspondence.',attachments:[]},
  {key:'david',provider:'twilio',subject:'Text conversation with David',correspondent:{name:'David Ortiz',address:'+14045550151'},body:'Hey Alex, David here. I may have more flexibility on renovation scope. Can we talk through it before you send anything else? Fictional text; this number is not verified against a CRM record.',attachments:[]},
  {key:'shared',provider:'gmail',subject:'Which buyer should this conversation belong to?',correspondent:{name:'Mike Bennett / David Ortiz',address:'shared.buyers@example.com'},body:'Hi Alex, Mike and David are reviewing possibilities together. This is a shared inbox, so please check which relationship record this conversation should use. Fictional example of an ambiguous identity.',attachments:[]},
  {key:'unknown',provider:'outlook',subject:'A new buyer introduction',correspondent:{name:'Jamie Parker',address:'jamie.parker@example.com'},body:'Hi Alex, I am exploring my first investment purchase. Could you tell me what information you would need from me? Fictional example; no investor record has been created.',attachments:[]},
 ];
}
export const inboxScenarios:InboxScenario[]=[
 {id:'mike-repair-followup',name:'Repair-cost follow-up',description:'A fictional follow-up arrives in the Gmail demo conversation.',channel:'email',available:true},
 {id:'sarah-rental-followup',name:'Rental-detail follow-up',description:'A fictional follow-up arrives in the Outlook demo mailbox.',channel:'email',available:true},
 {id:'david-text-followup',name:'Investor text follow-up',description:'A fictional investor text arrives at the demo business line.',channel:'sms',available:true},
 {id:'unknown-buyer',name:'New buyer message',description:'Another fictional message arrives from an unmatched contact.',channel:'email',available:true},
];
export function demoFollowup(actor:Actor,id:InboxScenarioId){
 const key=({'mike-repair-followup':'mike','sarah-rental-followup':'sarah','david-text-followup':'david','unknown-buyer':'unknown'} as const)[id];
 const fixture=demoThreadFixtures(actor).find(item=>item.key===key)!;
 const body=primary(actor)?({'mike-repair-followup':'Hi Alex, following up on the repair breakdown. Please separate confirmed figures from rough assumptions before we plan a walkthrough. Fictional follow-up; no contractor estimate has been verified.','sarah-rental-followup':'One more question: which rental operating costs are assumptions, and which have a source? Fictional follow-up.','david-text-followup':'Next Tuesday afternoon could work for a conversation. Please confirm before putting anything on the calendar. Fictional investor text.','unknown-buyer':'Thanks for taking a look. My preferred area is still open, and I can share more about my goals when we talk. Fictional follow-up.'}[id]):`Following up on my earlier message to ${actor.name.split(' ')[0]}. Please confirm the next step. This is a fictional incoming message.`;
 return {...fixture,body,attachments:[]};
}
