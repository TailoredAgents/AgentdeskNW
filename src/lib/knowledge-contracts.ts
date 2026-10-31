import type {Role} from './contracts';
export const knowledgeTopics=['relationships','buyer_matching','intake','diligence','handoff','closing','management','platform'] as const;
export type KnowledgeTopic=typeof knowledgeTopics[number];
export const knowledgeTopicLabels:Record<KnowledgeTopic,string>={relationships:'Investor relationships',buyer_matching:'Buyer matching',intake:'Wholesaler intake',diligence:'Deal diligence',handoff:'Team handoffs',closing:'Transaction coordination',management:'Office management',platform:'Using AgentDesk'};
export interface KnowledgeInput {title:string;topic:KnowledgeTopic;summary:string;roles:Role[];sourceTitle:string;sourceReference:string;sourceOwner:string;sourceDate:string;effectiveOn:string;reviewOn:string;prerequisites:string[];steps:string[];exceptions:string[];example:string;practicePrompt:string;practiceCriteria:string[]}
export interface KnowledgePublication {documentId:string;revision:number;input:KnowledgeInput;authority:'provisional'|'demo_reviewed';publishedAt:string;publishedBy:string;reference:string}
export interface KnowledgeDocument {id:string;version:number;draft:KnowledgeInput;withdrawn:boolean;activeFromRevision?:number;updatedAt:string;publishedRevisions:number[]}
export interface KnowledgeState {guides:KnowledgePublication[];documents:KnowledgeDocument[];canManage:boolean;canCoach:boolean;notice:string}
export interface KnowledgeReview {document:KnowledgeDocument;reviewReference:string;warnings:string[];notice:string}
export interface KnowledgeSearch {query:string;sources:KnowledgePublication[];conflicts:string[];answer:string;knowledgeAccessReferences:string[]}
export interface CoachingAttempt {id:string;createdAt:string;sourceChanged:boolean;guide:KnowledgePublication|null;answer:string|null;checklist:string[];notice:string}
export const emptyKnowledge:KnowledgeInput={title:'',topic:'platform',summary:'',roles:['dispositions','acquisitions','manager'],sourceTitle:'',sourceReference:'',sourceOwner:'',sourceDate:'',effectiveOn:'',reviewOn:'',prerequisites:[],steps:[],exceptions:[],example:'',practicePrompt:'',practiceCriteria:[]};
export const knowledgeFields=[{key:'title',label:'Guide title'},{key:'summary',label:'What this helps with'},{key:'sourceTitle',label:'Source title'},{key:'sourceReference',label:'Source reference'},{key:'sourceOwner',label:'Source owner'},{key:'sourceDate',label:'Source date (YYYY-MM-DD)'},{key:'effectiveOn',label:'Effective date (YYYY-MM-DD)'},{key:'reviewOn',label:'Review by (YYYY-MM-DD)'},{key:'prerequisites',label:'Facts needed first (one per line)'},{key:'steps',label:'Working steps (one per line)'},{key:'exceptions',label:'Exceptions and limits (one per line)'},{key:'example',label:'Example of useful work'},{key:'practicePrompt',label:'Practice situation'},{key:'practiceCriteria',label:'Review criteria (one per line)'}] as const;
const arrayFields=['prerequisites','steps','exceptions','practiceCriteria'] as const;
export type KnowledgeForm=Record<typeof knowledgeFields[number]['key'],string>&{topic:KnowledgeTopic;roles:Role[]};
export function knowledgeForm(input:KnowledgeInput=emptyKnowledge):KnowledgeForm{return {...input,...Object.fromEntries(arrayFields.map(key=>[key,input[key].join('\n')]))} as unknown as KnowledgeForm;}
export function knowledgeInput(form:KnowledgeForm):KnowledgeInput{return {...form,...Object.fromEntries(arrayFields.map(key=>[key,form[key].split('\n').map(value=>value.trim()).filter(Boolean)]))} as unknown as KnowledgeInput;}

export type KnowledgeWorkspace=KnowledgeState&{practice:CoachingAttempt[];selectedDocumentId?:string};
