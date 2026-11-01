import type {Role} from './contracts';
export type WorkToolSection='handoffs'|'opportunities'|'analysis'|'intake';
export type RoleAction='buyers'|'calling'|'notes'|'inbox'|'opportunities'|'handoffs'|'analysis'|'intake'|'management'|'knowledge'|'settings'|'employees';
export interface RoleShortcut {title:string;description:string;action:RoleAction}
const shortcuts:Record<Role,RoleShortcut[]>={
 dispositions:[
  {title:'Find the right buyer',description:'Start with existing investors and their relationship history.',action:'buyers'},
  {title:'Prepare the next conversation',description:'Review priorities, concerns and a useful next question.',action:'calling'},
  {title:'Review investor replies',description:'Read the source, prepare a response and save a follow-up.',action:'inbox'},
  {title:'Turn a call into action',description:'Capture supplied facts and review the next steps.',action:'notes'},
 ],
 acquisitions:[
  {title:'Review new opportunities',description:'Keep wholesaler submissions, missing facts and revisions together.',action:'opportunities'},
  {title:'Move your handoffs forward',description:'Review the assignment, report a blocker or record an outcome.',action:'handoffs'},
  {title:'Check the deal assumptions',description:'Compare sourced scenarios and inspect the downside.',action:'analysis'},
  {title:'Review inventory intake',description:'Clarify the source facts before a property handoff.',action:'intake'},
 ],
 manager:[
  {title:'See what needs attention',description:'Inspect current office work, blockers and review needs.',action:'management'},
  {title:'Coordinate the next step',description:'Assign an owner and review reported outcomes.',action:'handoffs'},
  {title:'Review acquisition opportunities',description:'Connect supplied facts to the current shared assignment.',action:'opportunities'},
  {title:'Review role guidance',description:'Keep the team’s reference material and methods current.',action:'knowledge'},
 ],
};
export const roleExperience={
 dispositions:{description:'Your investors, conversations and next opportunities. All in one place.',hero:'Build stronger relationships.',intro:'Explore buyer fit, relationship context, saved outreach and fictional replies.',shortcuts:shortcuts.dispositions},
 acquisitions:{description:'Your wholesaler submissions, deal questions and handoffs. All in one place.',hero:'Move promising deals forward.',intro:'Explore a wholesaler submission, resolve missing facts and follow its shared next step.',shortcuts:shortcuts.acquisitions},
 manager:{description:'Your office priorities, responsible people and next decisions. All in one place.',hero:'Keep the whole team moving.',intro:'Explore the office’s current blockers, assignments and reviewed outcomes.',shortcuts:shortcuts.manager},
} satisfies Record<Role,{description:string;hero:string;intro:string;shortcuts:RoleShortcut[]}>;
export function rolePrompts(role:Role){
 const common=[{title:'Plan my day',text:'What should I focus on today?'},{title:'My reminders',text:'Show my open reminders.'}];
 const specific:Record<Role,{title:string;text:string}[]>={
  dispositions:[{title:'Match existing buyers',text:'Find buyers already in my CRM for a property. Ask which property before starting.'},{title:'Review investor replies',text:'Have any investors replied in my company inbox?'}],
  acquisitions:[{title:'Review new opportunities',text:'Show my new wholesaler opportunities and explain what I should review next.'},{title:'Check my handoffs',text:'Show my handoffs and explain the current blockers and next steps.'}],
  manager:[{title:'Review office priorities',text:'Show team workload and explain which recorded blockers need attention.'},{title:'Review shared outcomes',text:'Review office handoffs. Which employee outcomes are waiting for manager review?'}],
 };
 return [common[0],...specific[role],common[1]];
}
/** Presentation routing only; services retain role/entitlement enforcement. */
export function roleNavigationVisible(role:Role,id:string){return role!=='acquisitions'||!['calling','packages','hunter'].includes(id);}
