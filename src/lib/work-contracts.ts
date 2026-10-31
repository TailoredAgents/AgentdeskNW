import type { ToolResult } from './contracts';
import type { WorkBudget } from './wallet-contracts';

/** A reference reads only a completed declared dependency's ToolResult.data. */
export interface WorkInputReference { $step:string; path:string }
export interface WorkStepInput { key:string; capabilityId:string; input:Record<string,unknown>; dependsOn:string[] }
export type WorkRunStatus='queued'|'running'|'waiting_cost_approval'|'waiting_for_input'|'waiting_for_dependency'|'paused'|'reconciling'|'completed'|'failed'|'canceled';
export interface WorkStep extends WorkStepInput {
 status:'pending'|'running'|'completed'|'failed'|'canceled';
 planVersion:number; estimatedCents:number; maximumCents:number; rateVersion:string;
 resolvedInput:Record<string,unknown>|null; result:ToolResult|null; error:string|null;
 attempts:number; startedAt:string|null; completedAt:string|null;
}
export interface WorkRunEvent { id:string; kind:string; message:string; createdAt:string; planVersion:number; stepKey:string|null }
export type WorkAnswerType='property'|'investor'|'text'|'number'|'datetime';
export interface WorkQuestion {reference:string;stepKey:string;prompt:string;answerType:WorkAnswerType;choices:{value:string;label:string}[];askedAt:string}
export interface AnswerWorkInput {expectedVersion:number;eventKey:string;questionReference:string;answer:string}
export interface WorkRun {
 id:string; ownerId:string; title:string; instructions:string; conversationId:string|null;
 version:number; planVersion:number; status:WorkRunStatus; steps:WorkStep[];
 budget:WorkBudget; events:WorkRunEvent[]; createdAt:string; updatedAt:string;
 lastError:string|null; contentRestricted:boolean; simulation:true;
 question?:WorkQuestion|null;
}
/** Server-derived model provenance. Never accept these references from an HTTP/model caller. */
export interface WorkSourceReferences {documentAccess?:string[];transactionTeamAccess?:string[];transactionAccess?:string[]; investors:string[];properties:string[];releases:string[];packages:string[];debriefs:string[];inboxThreads:string[];inboxAccess:string[];handoffAccess?:string[];workQuestions?:string[];knowledgeAccess?:string[];updatesAccess?:string[];analysisAccess?:string[];opportunityAccess?:string[] }
export interface CreateWorkRunInput { requestId:string; title:string; instructions:string; conversationId?:string; steps:WorkStepInput[]; sourceReferences?:WorkSourceReferences }
export interface WorkRunChange { expectedVersion:number; eventKey:string }
export interface ReviseWorkRunInput extends WorkRunChange { title?:string; instructions:string; steps:WorkStepInput[] }
export interface ControlWorkRunInput extends WorkRunChange { action:'pause'|'resume'|'cancel' }
export interface DecideWorkCostInput extends WorkRunChange { quoteId:string; decision:'approve'|'deny' }
