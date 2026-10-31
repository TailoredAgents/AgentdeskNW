import {createHash} from 'node:crypto';
import type {Actor,ToolResult} from '../lib/contracts';
import {getPackage} from './workflows';
import {getInboxState,preparePackageDraft} from './communications';
import {packageThreadContext} from './package-draft-context';
import {inboxAccessReference} from './communications-context';
import {AppError} from './db';

export function packageDraftPreparation(actor:Actor,packageId:string){
 const value=getPackage(actor,packageId);
 return {packageId,reference:packageThreadContext(actor,{packageId})!,eligible:value.status!=='blocked',accounts:getInboxState(actor).accounts.filter(account=>account.channel===value.channel&&account.access==='available'&&account.capabilities.localDraft)};
}
export function preparePropertyOutreachResult(actor:Actor,input:{packageId:string;accountId:string|null}):ToolResult {
 const prep=packageDraftPreparation(actor,input.packageId);
 const account=input.accountId?prep.accounts.find(account=>account.id===input.accountId):prep.accounts.find(account=>account.primary)??prep.accounts[0];
 if(!account)throw new AppError(422,'Choose an available account for this package channel. Email uses the company account when available.');
 const eventKey=`package-tool:${createHash('sha256').update(JSON.stringify([input.packageId,account.id,prep.reference])).digest('hex')}`;
 const detail=preparePackageDraft(actor,input.packageId,{accountId:account.id,reference:prep.reference,eventKey});
 return {specialistIds:['deal-marketing'],message:detail.draft?`Saved the property draft in ${account.label}. Review the exact content and recipient in Inbox. Existing employee edits are preserved. Nothing was sent.`:'This preparation already has an Inbox record. The previous draft was sent in simulation or discarded; it has not been recreated.',data:{packageId:input.packageId,threadId:detail.thread.id,hasDraft:!!detail.draft,liveDelivery:false},artifacts:[{type:'inbox',id:detail.thread.id,title:'Review property outreach',data:{inboxAccessReference:inboxAccessReference(actor,detail.thread.id)}},{type:'package',id:input.packageId,title:'Review source package'}]};
}
