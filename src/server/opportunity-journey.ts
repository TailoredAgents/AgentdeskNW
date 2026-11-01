import type {Actor} from '../lib/contracts';
import type {OpportunityDetail} from '../lib/opportunity-contracts';
import {handoffLabels} from '../lib/handoff-contracts';
import {getHandoffBoard} from './handoffs';
import {reviewOpportunityScreening,opportunityScreeningMessage} from './opportunity-screening';

/** Presentation only: intake/source hashes never depend on their derived coordination. */
export function reviewOpportunityJourney(actor:Actor,id:string):OpportunityDetail {
 const detail=reviewOpportunityScreening(actor,id),board=getHandoffBoard(actor);
 const item=board.items.find(value=>value.sourceKind==='opportunity'&&value.releaseId===id);
 const lines=item?[item.nextStep,`Source: opportunity v${item.releaseVersion} · ${item.releaseStatus}`]:['No shared assignment is available in your current scope. A manager can review this opportunity and assign its next step.'];
 if(item?.record){
  if(item.sourceChanged||item.attention==='source_changed')lines.push('Earlier assignment evidence does not resolve the current source. Open shared history to review it.');
  else {
   lines.push(`Responsible: ${item.assigneeName??'Unavailable employee'}`,`Assigned next step: ${item.record.nextAction}`,`Due: ${item.record.dueAt}`,item.record.acknowledgedAt?'Employee acknowledgment recorded.':'Employee acknowledgment pending.');
   if(item.record.outcome)lines.push(`Employee-reported ${item.record.outcome.kind}: ${item.record.outcome.note}`,`Supplied evidence reference: ${item.record.outcome.evidence}`);
   if(item.record.resolution)lines.push(`Manager review: ${item.record.resolution.note}`);
  }
 }
 lines.push('Shared follow-up only. No inventory listing, investor contact or completed transaction is implied.');
 return {...detail,followThrough:{title:item?handoffLabels[item.attention]:'Next-step coordination',lines,handoffId:item?.releaseId??null,handoffAccessReference:board.handoffAccessReference}};
}
export function opportunityJourneyMessage(detail:OpportunityDetail):string {
 return [opportunityScreeningMessage(detail),...(detail.followThrough?[detail.followThrough.title,...detail.followThrough.lines]:[])].join('\n\n');
}
