/** Employee projection only: provider payloads, claim tokens and source fingerprints stay server-side. */
export interface AssignmentReview {
 id:string; conversationReference?:string; title:string; summary:string; revision:number; quoteId:string;
 parts:{key:string;label:string;maximumCalls:number}[];
 estimatedCents:number; maximumCents:number; spentCents:number; heldCents:number;
 expiresAt:string; createdAt:string;
 state:'waiting'|'ready'|'claimed'|'continued'|'denied'|'obsolete'|'closed';
 contentRestricted:boolean; canDecide:boolean; canCancel:boolean; canRenew:boolean; canPause?:boolean; canContinue?:boolean; replacedByRenewal?:boolean; executionState:'open'|'stopping'|'canceled'|'completed'|'needs_attention'|'pausing'|'paused'; simulation:true;
}
export interface AssignmentReviewDecision {
 quoteId:string; revision:number; decision:'approve'|'deny'; eventKey:string;
}
export const assignmentReviewStatus:Record<AssignmentReview['state'],string>={
 waiting:'Needs your cost decision',ready:'Approved · waiting to continue',claimed:'Continuing saved work',
 continued:'Returned to original work',denied:'Cost declined',obsolete:'Needs an updated quote',closed:'Assignment closed',
};
export const assignmentReviewNotice='Simulated credits. This review covers the listed assignment parts. Funding your wallet does not approve work.';

export interface AssignmentCancellation {quoteId:string;revision:number;eventKey:string}
export const assignmentCancellationNotice='Cancel remaining execution. Completed work and incurred credits stay saved. An in-flight or uncertain request may still incur usage; its held credit stays reserved until the outcome is known.';
export const assignmentExecutionStatus:Record<AssignmentReview['executionState'],string>={pausing:'Pausing after the current response',paused:'Paused · completed work retained',open:'',stopping:'Stopping · usage outcome pending',canceled:'Remaining work canceled',completed:'Assignment completed',needs_attention:'Usage needs reconciliation'};

export type AssignmentRenewal=AssignmentCancellation;

export const assignmentReviewLabel=(review:AssignmentReview)=>review.replacedByRenewal?'Replaced by updated quote':assignmentExecutionStatus[review.executionState]||assignmentReviewStatus[review.state];

export interface AssignmentTextControl extends AssignmentCancellation {action:'pause'|'continue'|'revise';instructions?:string}
