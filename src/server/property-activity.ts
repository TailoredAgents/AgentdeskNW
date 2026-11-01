import {packageThreadContext} from './package-draft-context';
import type {Actor} from '../lib/contracts';
import type {PropertyActivity} from '../lib/record-contracts';
import {AppError,getDb} from './db';
import {featureAccess} from './billing';
import {readProperty} from './access';
import {buildBuyerShortlist} from './buyer-shortlist';
import {getInboxState,getInboxThread} from './communications';
import {getPackage} from './workflows';
import {getPersonalTask} from './task-actions';
/** Current projections only. No outbound action, inferred reply or private manager inheritance. */
export function propertyActivity(actor:Actor,propertyId:string):PropertyActivity|null {
 readProperty(actor,propertyId);
 if(!['dispositions','manager'].includes(actor.role)||!featureAccess(actor,'buyer-matchmaker').allowed)return null;
 const shortlist=buildBuyerShortlist(actor,propertyId);
 const buyers=shortlist.matches.slice(0,12).map(match=>({investorId:match.investorId,name:match.investorName,score:match.score,reasons:match.reasons,cautions:match.cautions,nextAction:match.nextAction.title,question:match.nextAction.question}));
 const conversations:PropertyActivity['conversations']=[];
 // Merely opening inventory must not create a second fictional mailbox or send anything.
 const seeded=getDb().prepare('SELECT 1 FROM communication_demo_seeds WHERE organization_id=? AND office_id=? AND owner_id=?').get(actor.organizationId,actor.officeId,actor.id);
 if(seeded)for(const thread of getInboxState(actor).threads){
  if(!thread.packageId)continue;
  try{
   const pkg=getPackage(actor,thread.packageId);if(pkg.releaseId!==shortlist.releaseId||pkg.status==='blocked'||thread.packageReference!==packageThreadContext(actor,thread))continue;
   const detail=getInboxThread(actor,thread.id);if(detail.bodyAccess!=='full')continue;
   const lastSent=detail.messages.filter(m=>m.direction==='outbound'&&m.deliveryStatus==='simulated_sent').at(-1);
   const sentIndex=lastSent?detail.messages.findIndex(m=>m.id===lastSent.id):-1;
   const reply=sentIndex>=0?detail.messages.slice(sentIndex+1).filter(m=>m.direction==='inbound'&&m.bodyAvailability!=='headers_only'&&m.bodyAvailability!=='revoked').at(-1):undefined;
   const followUps:PropertyActivity['conversations'][number]['followUps']=[];
   const actions=getDb().prepare('SELECT data FROM communication_workflow_actions WHERE organization_id=? AND office_id=? AND owner_id=? AND thread_id=?').all(actor.organizationId,actor.officeId,actor.id,thread.id) as {data:string}[];
   for(const row of actions){const action=JSON.parse(row.data) as {kind:string;recordId:string;messageId:string};if(action.kind!=='follow_up'||!detail.messages.some(m=>m.id===action.messageId))continue;try{const task=getPersonalTask(actor,action.recordId);followUps.push({id:task.id,title:task.title,status:task.status});}catch(e){if(!(e instanceof AppError&&[403,404].includes(e.status)))throw e;}}
   conversations.push({threadId:thread.id,name:detail.thread.correspondent.name,account:detail.account.label,draft:!!detail.draft,current:detail.draft?.packageSource?.current!==false,simulatedSent:!!lastSent,reply:reply?{text:reply.body.slice(0,1000),receivedAt:reply.receivedAt}:null,followUps});
  }catch(e){if(!(e instanceof AppError&&[403,404,409].includes(e.status)))throw e;}
 }
 return {releaseStatus:shortlist.releaseStatus,buyers,conversations:conversations.slice(0,20),notice:'Existing CRM first. Fit is not buying intent. These are your saved property conversations and source-linked follow-ups; simulated sends never contact an investor. Replies are shown only when an incoming message follows a simulated send.'};
}
