import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {TextRecoveryPreview} from '../lib/assignment-review-contracts';
import {AppError,getDb} from './db';
import {requireFeature} from './billing';
import {withAssignment} from './assignment-roots';
import {getAssignmentReview,originalAssignmentReview} from './assignment-reviews';
import {readTextExecution,textContextManifest} from './text-execution';
import {currentTextContext,currentTextScope} from './orchestrator';
import {textProviderConfig} from './provider-config';
import {fingerprint} from './provider-runtime';
import {controlTextAssignment} from './text-controls';

const id=z.string().trim().min(1).max(150);
export const textRecoveryPreviewSchema=z.object({quoteId:id,revision:z.number().int().positive(),instructions:z.string().trim().min(3).max(2000)}).strict();
export const textRecoveryDecisionSchema=textRecoveryPreviewSchema.extend({token:z.string().regex(/^[a-f0-9]{64}$/),eventKey:id}).strict();
const labels:Record<string,string>={actor:'Employee role and workspace',knowledge:'Office guidance',updates:'Chosen updates',documents:'Private documents',transactionTeams:'Shared transaction coordination',transactions:'Private transactions',analyses:'Deal analyses',opportunities:'Acquisition opportunities',handoffs:'Team handoffs',workingMethods:'Specialist methods',workAccess:'Saved work',employeeMemory:'Employee preferences',investors:'Investor records',properties:'Property records',protectedState:'Criteria, releases and follow-ups',relationshipReports:'Relationship reports',inbox:'Private correspondence',access:'Workforce access',withheld:'Conversation source availability'};

/** Trusted preparation; only .preview may leave the service. No old source content is returned. */
export function prepareTextRecovery(actor:Actor,reviewId:string,raw:z.input<typeof textRecoveryPreviewSchema>){
 const input=textRecoveryPreviewSchema.parse(raw);requireFeature(actor,'core');
 return getDb().transaction(()=>{
  const original=originalAssignmentReview(actor,reviewId),view=getAssignmentReview(actor,reviewId);
  if(input.quoteId!==view.quoteId||input.revision!==view.revision||!view.canRecover||original.host.kind!=='turn')throw new AppError(409,'Pause the current original assignment and wait for its saved boundary before reviewing changed context.');
  return withAssignment(actor,original.host,()=>{
   const saved=readTextExecution(actor,original.host.id),config=textProviderConfig();
   if(!saved?.data.request||!saved.data.metering||saved.data.metering.reviewId!==reviewId||!['ready','received'].includes(saved.phase)||fingerprint(config)!==fingerprint(saved.data.config)||config.spendingMode!=='admitted_demo')throw new AppError(409,'The saved request or AI configuration needs reconciliation before source recovery.');
   if(original.assignment.attempts.some(a=>['dispatched','unknown'].includes(a.status)||a.discrepancy))throw new AppError(409,'Reconcile outstanding usage before reviewing changed context.');
   if(original.assignment.parts.some(p=>!p.key.startsWith('text:')))throw new AppError(409,'Other paid hosts need coordinated scope recovery first.');
   const scope=currentTextScope(actor,saved.conversationId),manifest=textContextManifest(scope),scopeHash=fingerprint(scope);
   if(scopeHash===saved.scopeHash)throw new AppError(409,'The saved context is still current. Continue or revise the paused work normally.');
   const context=currentTextContext(actor,saved.conversationId);
   const changedAreas=saved.data.contextManifest?Object.keys(manifest).filter(key=>manifest[key]!==saved.data.contextManifest![key]).map(key=>labels[key]??'Workspace information'):['Workspace information; this older checkpoint has no category comparison'];
   const currentRecords=[`${context.investors.length} currently accessible investors; ${context.properties.length} properties; ${context.tasks.length} personal follow-ups. Showing up to eight current properties and five follow-ups below.`,...context.properties.slice(0,8).map(p=>`${p.address}: ${p.status}; asking $${p.price.toLocaleString('en-US')}; ${p.rehab} rehab.`),...context.tasks.slice(0,5).map(t=>`${t.title}: ${t.status}${t.dueAt?`; due ${new Date(t.dueAt).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})} Eastern`:''}.`)];
   const notice='The Agent will use your current workspace and the instructions below. Earlier reasoning and unfinished output will be set aside. Completed work and charges stay saved. Existing saved jobs keep their plans and will check their sources before continuing. You will receive an updated cost review that includes prior spending.';
   const details={instructions:input.instructions,changedAreas,currentRecords,completedTools:saved.data.handled.length,spentCents:original.assignment.budget.spentCents,discardedResponse:saved.phase==='received',notice};
   const token=fingerprint({actor,reviewId,quoteId:input.quoteId,revision:input.revision,version:saved.version,scopeHash,contextHash:fingerprint(context),config,details});
   const preview:TextRecoveryPreview={token,...details};
   return {preview,context,manifest,scopeHash};
  });
 }).immediate();
}

/** Employee-only reviewed recovery; exact retries retain the same replacement and original root. */
export function recoverTextAssignment(actor:Actor,reviewId:string,raw:z.input<typeof textRecoveryDecisionSchema>){
 const input=textRecoveryDecisionSchema.parse(raw);
 return controlTextAssignment(actor,reviewId,{quoteId:input.quoteId,revision:input.revision,eventKey:input.eventKey,action:'revise',instructions:input.instructions},{token:input.token});
}
