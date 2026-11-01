import {createHash} from 'node:crypto';
import type {Actor} from '../lib/contracts';
import type {CommunicationDraft,InboxDraftRevisionContext,InboxThreadDetail} from '../lib/communications-contracts';
import {readInvestorRow} from './access';
import {getDb} from './db';
import {getEmployeeMemory} from './memory';
import {relationshipMethodFingerprint} from './relationship-methods';
import {correspondenceMethodVersion,reviewCorrespondenceIntent} from './correspondence-intent';

/** Input is a fresh, privately scoped Inbox read, never a caller/model-supplied detail. */
export function inboxDraftRevisionContext(actor:Actor,detail:InboxThreadDetail):InboxDraftRevisionContext {
 const draft=detail.draft,thread=detail.thread;
 let reason:string|null=null;
 if(detail.bodyAccess!=='full'||!detail.account.capabilities.localDraft)reason=detail.capabilityNotice;
 else if(!detail.canEdit)reason=detail.accessReason;
 else if(!draft||draft.status!=='draft'||draft.deliveryStatus!=='not_sent')reason='Save an ordinary reply draft before asking Copilot to rewrite it.';
 else if(thread.packageId||thread.transactionId||draft.packageSource||draft.transactionSource)reason='Property packages and transaction drafts need their own source-bound preparation. This rewrite supports ordinary relationship replies only.';
 else if(draft.cc?.length||draft.documents?.length||draft.documentFiles?.length)reason='This draft has CC recipients or files. Edit it in Inbox so its complete recipient and file review is preserved.';
 else if(thread.association.status==='unavailable')reason='The relationship context is no longer available. Review the association before preparing a new reply.';
 else if(draft.accountId!==detail.account.id||draft.threadId!==thread.id||draft.from.address!==detail.account.address||draft.to.address!==thread.correspondent.address)reason='The draft sender or recipient no longer matches this conversation. Review it in Inbox.';
 const latest=[...detail.messages].reverse().find(message=>message.direction==='inbound');
 if(!reason&&!latest)reason='This conversation has no incoming message. Write the opening message in Inbox; Copilot rewriting currently supports replies.';
 if(!reason&&latest&&reviewCorrespondenceIntent(latest.body).contactDeclined)reason='The latest incoming message includes a contact-stop request. Review the contact preference before preparing another reply.';
 const base={eligible:!reason,reason,threadId:thread.id,threadVersion:thread.version,draftId:draft?.id??null,draftVersion:draft?.version??null};
 if(reason||!draft)return {...base,sourceReference:null};
 const storedThread=getDb().prepare('SELECT data FROM communication_threads WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(thread.id,actor.organizationId,actor.officeId,actor.id) as {data:string};
 const associationRevision=(JSON.parse(storedThread.data) as {associationRevision?:number}).associationRevision??0;
 const journey=detail.investorContext?{...detail.investorContext,generatedAt:undefined,record:{...detail.investorContext.record,generatedAt:undefined}}:null;
 const investor=thread.association.investor?readInvestorRow(actor,thread.association.investor.id):null;
 // Legacy sharing/policy settings have no state version. Their trusted append-only audit identity
 // prevents revoked-and-restored access from reviving an earlier rewrite's provenance.
 const sharingRevision=investor?getDb().prepare("SELECT id FROM audit_logs WHERE organization_id=? AND entity_id=? AND event='investor.sharing.updated' ORDER BY rowid DESC LIMIT 1").get(actor.organizationId,investor.id)??null:null;
 const policyRevision=getDb().prepare("SELECT id FROM audit_logs WHERE organization_id=? AND event='ownership.policy.updated' ORDER BY rowid DESC LIMIT 1").get(actor.organizationId)??null;
 const protectedData=getDb().prepare('SELECT data FROM property_releases WHERE organization_id=? AND office_id=? ORDER BY id').all(actor.organizationId,actor.officeId);
 const organization=getDb().prepare('SELECT settings FROM organizations WHERE id=?').get(actor.organizationId);
 // Mutable draft body/version and thread read-state are deliberately outside the source binding.
 // The caller separately supplies exact draft and thread versions; saving text must not stale itself.
 const sourceReference=createHash('sha256').update(JSON.stringify({version:1,actor,associationRevision,sharingRevision,policyRevision,account:detail.account,thread:{id:thread.id,accountId:thread.accountId,channel:thread.channel,subject:thread.subject,correspondent:thread.correspondent,association:thread.association},envelope:{from:draft.from,to:draft.to,subject:draft.subject},messages:detail.messages,journey,investor,memory:getEmployeeMemory(actor),workingMethods:relationshipMethodFingerprint(),correspondenceMethodVersion,protectedData,organization})).digest('hex');
 return {...base,sourceReference};
}

/** Recompute public freshness; persisted current flags never authorize review. */
export function visibleCopilotDraftRevision(actor:Actor,detail:InboxThreadDetail,draft:CommunicationDraft|null):CommunicationDraft|null {
 if(!draft?.copilotRevision)return draft;
 const context=inboxDraftRevisionContext(actor,detail);
 const current=draft.authorship==='copilot'&&draft.id===detail.draft?.id&&draft.version===detail.draft.version&&context.eligible&&context.sourceReference===draft.copilotRevision.sourceReference;
 const reason=current?null:context.reason??'The saved wording or its source context changed. Ask Copilot for a fresh rewrite using the current conversation, or edit the draft in Inbox.';
 return {...draft,copilotRevision:{...draft.copilotRevision,current,reason}};
}
