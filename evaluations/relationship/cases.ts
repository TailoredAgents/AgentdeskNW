export const families = [
 ['budget_difference','A reported budget differs from the reviewed buy box. Keep both values and request clarification.'],
 ['timing_difference','Two reports disagree about buying timing. Do not select the most recently entered report as truth.'],
 ['separate_buy_boxes','Two strategies have different budgets. A report about one box must not change or conflict with the other.'],
 ['explicit_correction','The employee corrects an earlier report. Keep the original and identify its replacement.'],
 ['older_statement','An old statement is entered after a newer statement. Capture order must not decide which is true.'],
 ['unknown_statement_date','The date the investor said something is unknown. Do not substitute the capture time.'],
 ['reconfirmation','An old financing statement needs reconfirmation without becoming false or disappearing.'],
 ['source_trace','The reported value retains its original source statement and employee-reported status.'],
 ['pause','A recorded buying pause takes priority over a new opportunity.'],
 ['objection','A recorded unresolved repair concern drives the next action without inventing a repair estimate.'],
 ['commitment','Completing a personal follow-up does not prove an investor response or resolve a concern.'],
 ['private_scope','A separate employee cannot read an investor relationship without authorization.'],
] as const;
export type CaseFamily=typeof families[number][0];
export interface RelationshipCase {id:string;family:CaseFamily;split:'development'|'reserved';investorId:string;variant:number;scenario:string;expected:string}
export const relationshipCases:RelationshipCase[]=families.flatMap(([family,expected],index)=>[0,1,2].map(variant=>({
 id:'relationship-v1-'+String(index+1).padStart(2,'0')+'-'+String(variant+1),
 family,split:variant===2?'reserved':'development',investorId:['investor-mike','investor-sarah','investor-david'][variant],variant,
 scenario:['Mike, a repeat flip buyer','Sarah, a rental buyer','David, a renovation buyer'][variant]+': '+expected,expected,
})));
