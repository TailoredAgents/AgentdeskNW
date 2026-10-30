export type WalletScenarioId='reply-draft'|'relationship-briefing'|'investor-research';
export interface WalletScenario {
 id:WalletScenarioId;name:string;description:string;feature:string;rateVersion:number;markupMultiplier:5;
 maximumCents:number;successCents:number;sampleProviderMaximumCents:number;sampleProviderSuccessCents:number;
 allowed:boolean;reason:string;
}
export interface WalletQuote {
 id:string;scenarioId:WalletScenarioId|'copilot-work';name:string;feature:string;rateVersion:number;markupMultiplier:5;
 maximumCents:number;successCents:number;sampleProviderMaximumCents:number;sampleProviderSuccessCents:number;
 costBasis:'fictional_sample';createdAt:string;expiresAt:string;
}
export interface WalletOperation {
 id:string;quoteId:string;scenarioId:WalletScenarioId|'copilot-work';name:string;periodStart:string;rateVersion:number;workRunId?:string;
 status:'reserved'|'unknown'|'settled'|'released';maximumCents:number;chargedCents:number;
 includedReservedCents:number;purchasedReservedCents:number;quote:WalletQuote;createdAt:string;updatedAt:string;
}
export interface WalletLedgerEntry {
 id:string;kind:'monthly_credit'|'topup'|'reservation'|'settlement'|'release'|'expiration'|'unknown'|'settings';
 description:string;periodStart:string;includedDeltaCents:number;purchasedDeltaCents:number;
 reservedIncludedDeltaCents:number;reservedPurchasedDeltaCents:number;chargedCents:number;expiredCents:number;
 operationId:string|null;createdAt:string;simulated:true;
}
export interface WalletState {
 version:number;periodStart:string;periodEnd:string;monthlyIncludedCents:number;
 includedCents:number;purchasedCents:number;reservedCents:number;availableCents:number;
 spentThisPeriodCents:number;reservedThisPeriodCents:number;monthlySpendLimitCents:number;spendRemainingCents:number;
 lowBalance:boolean;lowBalanceThresholdCents:number;canSpend:boolean;canTopUp:boolean;accessReason:string;
 topUpOptionsCents:number[];scenarios:WalletScenario[];operations:WalletOperation[];ledger:WalletLedgerEntry[];
 mode:'demonstration';liveUsageDebiting:false;notice:string;
}

/** Whole-job fictional customer-credit authority; distinct from real provider receipts. */
export interface WorkBudget {
 runId:string;planVersion:number;planHash:string;quoteId:string;
 estimatedCents:number;maximumCents:number;spentCents:number;reservedCents:number;
 approvedMaximumCents:number|null;
 status:'awaiting_approval'|'approved'|'reserved'|'denied'|'released'|'settled'|'unknown';
 expiresAt:string;createdAt:string;updatedAt:string;rateVersion:1;costBasis:'fictional_sample';
 operationId:string|null;
}
