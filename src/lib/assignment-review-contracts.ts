/** Employee projection only: provider payloads, claim tokens and source fingerprints stay server-side. */
export interface AssignmentReview {
 id:string; title:string; summary:string; revision:number; quoteId:string;
 parts:{key:string;label:string;maximumCalls:number}[];
 estimatedCents:number; maximumCents:number; spentCents:number; heldCents:number;
 expiresAt:string; createdAt:string;
 state:'waiting'|'ready'|'claimed'|'continued'|'denied'|'obsolete'|'closed';
 contentRestricted:boolean; canDecide:boolean; simulation:true;
}
export interface AssignmentReviewDecision {
 quoteId:string; revision:number; decision:'approve'|'deny'; eventKey:string;
}
export const assignmentReviewStatus:Record<AssignmentReview['state'],string>={
 waiting:'Needs your cost decision',ready:'Approved · waiting to continue',claimed:'Continuing saved work',
 continued:'Returned to original work',denied:'Cost declined',obsolete:'Needs an updated quote',closed:'Assignment closed',
};
export const assignmentReviewNotice='Simulated credits. This review covers the listed assignment parts. Funding your wallet does not approve work.';
