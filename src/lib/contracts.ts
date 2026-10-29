export type Role = 'dispositions' | 'acquisitions' | 'manager';
export interface Actor { id:string; name:string; organizationId:string; officeId:string; role:Role }
export interface Evidence { id:string; title:string; url:string|null; observedAt:string; detail:string; synthetic:boolean }
export interface Investor { id:string; name:string; company:string; counties:string[]; strategy:string; budgetMin:number; budgetMax:number; financing:string|null; rehab:string|null; timeframe:string|null; email:string|null; phone:string|null; notes:string; lastContactAt:string|null; ownerId:string; synthetic:boolean }
export interface Property { id:string; address:string; city:string; county:string; price:number; beds:number; baths:number; sqft:number; strategy:string; rehab:string; status:string; synthetic:boolean }
export interface Prospect { id:string; name:string; company:string; county:string; strategy:string; typicalPrice:number; transactionCount:number; lastActivityAt:string; score:number; scoreBreakdown:Record<string,number>; rationale:string; duplicateStatus:'net_new'|'existing'|'possible_duplicate'|'uncertain'; matchedInvestorId:string|null; phone:string|null; contactStatus:'missing'|'unverified'|'verified'; evidence:Evidence[]; synthetic:boolean }
export type JobStatus = 'queued'|'running'|'awaiting_input'|'completed'|'failed'|'canceled';
export interface ResearchInput { address:string; county:string; price:number; strategy:string; limit:number }
export interface ResearchJob { id:string; input:ResearchInput; status:JobStatus; progress:number; stage:string; provider:string; prospects:Prospect[]; error:string|null; createdAt:string; updatedAt:string; ownerId:string; attempt:number }
export interface Task { id:string; title:string; dueAt:string|null; status:'open'|'completed'; investorId:string|null; ownerId:string; createdAt:string }
export interface ProposedAction { id:string; kind:'crm_note'|'crm_import'|'crm_update'; title:string; status:'pending'|'approved'|'rejected'|'executed'|'failed'; payload:Record<string,unknown>; createdAt:string; executedAt:string|null; ownerId:string; error:string|null }
export interface Notification { id:string; title:string; body:string; read:boolean; createdAt:string; link:string }
export interface Message { id:string; role:'user'|'assistant'; content:string; createdAt:string; specialistIds:string[]; artifacts:Artifact[] }
export interface Artifact { type:'job'|'approval'|'notes'|'task'|'investors'|'guidance'; id?:string; title:string; data?:unknown }
export interface Conversation { id:string; title:string; createdAt:string; updatedAt:string; messages:Message[] }
export interface Specialist { id:string; name:string; purpose:string; category:'Dispositions'|'Company-wide'|'Acquisitions'|'Management'; status:'demo'|'ready'|'planned'; roles:Role[]; tools:string[]; approval:string; inputs:string[]; outputs:string[] }
export interface NoteSummary { summary:string; parties:string[]; facts:string[]; criteria:Record<string,string>; commitments:string[]; questions:string[]; objections:string[]; missingInformation:string[]; suggestedTasks:string[]; proposedNote:string; mode:'local_extraction'|'model'; source:'employee_transcript'; sourceExcerpts:string[] }
export interface ToolResult { specialistIds:string[]; message:string; artifacts:Artifact[]; data?:unknown }
export interface Settings { guidance:'concise'|'guided'; notifications:boolean; quietHoursStart:number; quietHoursEnd:number }
export interface Bootstrap { actor:Actor; organization:{name:string;office:string}; investors:Investor[]; properties:Property[]; tasks:Task[]; jobs:ResearchJob[]; approvals:ProposedAction[]; notifications:Notification[]; conversations:Conversation[]; specialists:Specialist[]; settings:Settings; integrations:{openai:boolean;voice:boolean;crm:'demo';research:'synthetic';auth:'local_demo'}; usage:{kind:string;quantity:number}[] }
