import type {Role} from '../../src/lib/contracts';
export const workSections=[
 {id:'updates',label:'My updates',description:'Briefings, replies and work needing attention',group:'Today'},
 {id:'tasks',label:'My follow-ups',description:'Personal reminders and completed work',group:'Today'},
 {id:'jobs',label:'Agent jobs & approvals',description:'Plans, spending decisions, progress and results',group:'Today'},
 {id:'records',label:'Deals & investors',description:'Current facts, buying criteria and relationship context',group:'Business records'},
 {id:'transactions',label:'Transactions',description:'Parties, milestones, title drafts and shared work',group:'Business records'},
 {id:'handoffs',label:'Handoffs',description:'Assignments, acknowledgment and resolution',group:'Business records'},
 {id:'analysis',label:'Deal analysis',description:'Assumptions, scenarios and saved calculations',group:'Business records'},
 {id:'opportunities',label:'New opportunities',description:'Wholesaler intake, questions and screening',group:'Business records'},
 {id:'intake',label:'Inventory intake',description:'Acquisition review of existing inventory',group:'Business records'},
 {id:'documents',label:'Documents',description:'Private working text and reviewed revisions',group:'Reference'},
 {id:'knowledge',label:'Role guidance',description:'Company guidance and sourced answers',group:'Reference'},
] as const;
export type WorkSection=typeof workSections[number]['id'];
export function sectionsForRole(role:Role,query='') {const term=query.trim().toLowerCase();return workSections.filter(item=>(role!=='dispositions'||!['opportunities','intake'].includes(item.id))&&`${item.label} ${item.description} ${item.group}`.toLowerCase().includes(term));}
