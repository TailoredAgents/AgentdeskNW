import {ccText} from '../../src/lib/communication-recipients';
import type {CommunicationDocumentReference,InboxSendReview,InboxThreadDetail} from '../../src/lib/communications-contracts';

export interface InboxEditor {
 documents:CommunicationDocumentReference[];savedDocuments:CommunicationDocumentReference[];threadId:string; sourceVersion:number; baseVersion:number; subject:string; body:string; savedSubject:string; savedBody:string;cc:string;savedCc:string;
}
export function editorFor(detail:InboxThreadDetail):InboxEditor {
 const readable=detail.bodyAccess==='full';
 const subject=readable?(detail.draft?.subject??(detail.thread.channel==='email'?`Re: ${detail.thread.subject.replace(/^re:\s*/i,'')}`.slice(0,240):'')):'';
 const body=readable?(detail.draft?.body??''):'',cc=readable?ccText(detail.draft?.cc):'';
 const documents=readable?detail.draft?.documents??[]:[];
 return {documents,savedDocuments:documents,threadId:detail.thread.id,sourceVersion:detail.account.accessVersion,baseVersion:detail.thread.version,subject,body,cc,savedCc:cc,savedSubject:subject,savedBody:body};
}
export const editorDirty=(value:InboxEditor|null)=>!!value&&(value.body!==value.savedBody||value.subject!==value.savedSubject||value.cc!==value.savedCc||JSON.stringify(value.documents)!==JSON.stringify(value.savedDocuments));
/** Polling must never adopt a new write version while retaining unreviewed edits. */
export function reconcileEditor(value:InboxEditor|null,detail:InboxThreadDetail):InboxEditor {
 if(!value||value.threadId!==detail.thread.id||value.sourceVersion!==detail.account.accessVersion||detail.bodyAccess!=='full'||detail.draft?.transactionSource?.current===false||!editorDirty(value))return editorFor(detail);
 return value;
}
/** Only an explicit comparison accepts a newer saved version for the employee's text. */
export function keepReviewedEdits(value:InboxEditor,detail:InboxThreadDetail):InboxEditor {
 if(value.threadId!==detail.thread.id||value.sourceVersion!==detail.account.accessVersion||detail.bodyAccess!=='full'||detail.draft?.transactionSource?.current===false)throw new Error('Source access changed. Open the conversation again.');
 const current=editorFor(detail);
 return {...current,documents:value.documents,body:value.body,subject:value.subject,cc:value.cc};
}
export function reviewMatches(review:InboxSendReview,detail:InboxThreadDetail,editor:InboxEditor|null,at=Date.now()):boolean {
 return detail.draft?.copilotRevision?.current!==false&&detail.draft?.transactionSource?.current!==false&&!editorDirty(editor)&&detail.canEdit&&detail.bodyAccess==='full'&&detail.account.capabilities.simulateSend&&
 review.threadId===detail.thread.id&&review.threadVersion===detail.thread.version&&review.accountId===detail.account.id&&
 review.accountContext?.accessVersion===detail.account.accessVersion&&review.draftId===detail.draft?.id&&review.draftVersion===detail.draft?.version&&
 JSON.stringify(review.documents??[])===JSON.stringify(detail.draft?.documents??[])&&(detail.draft?.documentFiles??[]).every(file=>file.current===true)&&JSON.stringify(review.cc??[])===JSON.stringify(detail.draft?.cc??[])&&(review.authorship??'copilot')===(detail.draft?.authorship??'copilot')&&review.body===detail.draft?.body&&review.subject===detail.draft?.subject&&Date.parse(review.expiresAt)>at;
}
export function inboxContextKey(detail:InboxThreadDetail):string {
 const journey=detail.investorContext;
 return JSON.stringify({thread:detail.thread,account:detail.account,draft:detail.draft,canEdit:detail.canEdit,bodyAccess:detail.bodyAccess,
  journey:journey?{...journey,generatedAt:undefined,record:{...journey.record,generatedAt:undefined}}:null});
}
