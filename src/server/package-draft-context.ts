import {createHash} from 'node:crypto';
import type {Actor} from '../lib/contracts';
import type {CommunicationDraft,InboxThread} from '../lib/communications-contracts';
import {getPackage} from './workflows';
import {readInvestor} from './access';

export function packageThreadContext(actor:Actor,thread:Pick<InboxThread,'packageId'>):string|null {
 if(!thread.packageId)return null;
 const value=getPackage(actor,thread.packageId),investor=readInvestor(actor,value.investorId);
 // Approval/copy timestamps do not change prepared content. Eligibility and contact changes do.
 return createHash('sha256').update(JSON.stringify({id:value.id,body:value.body,subject:value.subject,blocked:value.status==='blocked',channel:value.channel,releaseVersion:value.releaseVersion,disclosureVersion:value.disclosureVersion,email:investor.email,phone:investor.phone})).digest('hex');
}
export function visiblePackageDraft(actor:Actor,draft:CommunicationDraft|null):CommunicationDraft|null {
 if(!draft?.packageSource)return draft;
 const value=getPackage(actor,draft.packageSource.packageId);
 const current=value.status!=='blocked'&&packageThreadContext(actor,{packageId:value.id})===draft.packageSource.reference;
 const projected={...draft,packageSource:{...draft.packageSource,current}};
 return current||draft.deliveryStatus==='simulated_sent'?projected:{...projected,subject:'Property package changed',body:'This unsent property draft is out of date. Resolve eligibility and prepare the current package.',cc:[],documents:[],documentFiles:[]};
}
