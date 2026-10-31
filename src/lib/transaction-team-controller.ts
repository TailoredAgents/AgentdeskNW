import type {TransactionMilestone} from './transaction-contracts';
import type {TransactionTeamBoard,TransactionTeamItem,TransactionTeamSetup,TransactionTeamPublish,TransactionTeamReview,TransactionTeamAction,TransactionTeamTaskHistory} from './transaction-team-contracts';
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
export interface TeamActionForm {action:TransactionTeamAction['action'];taskId:string;assignedTo:string;instruction:string;dueDate:string;kind:'blocked'|'completed';note:string;source:string;expectedVersion:number}
export interface TeamWorkspace {board:TransactionTeamBoard|null;item:TransactionTeamItem|null;setup:TransactionTeamSetup|null;publish:TransactionTeamPublish|null;review:TransactionTeamReview|null;action:TeamActionForm|null;decision:TransactionTeamAction|null;history:TransactionTeamTaskHistory|null;pending:{path:string;body:unknown}|null;busy:boolean;error:string}
export class TransactionTeamController {
 value:TeamWorkspace={board:null,item:null,setup:null,publish:null,review:null,action:null,decision:null,history:null,pending:null,busy:false,error:''};private active=true;private epoch=0;private listeners=new Set<(state:TeamWorkspace)=>void>();
 constructor(private api:Api,private key:()=>string){}
 activate(){this.active=true;}dispose(){this.active=false;this.epoch++;}subscribe(fn:(state:TeamWorkspace)=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private set(patch:Partial<TeamWorkspace>){if(this.active){this.value={...this.value,...patch};this.listeners.forEach(fn=>fn(this.value));}}
 get dirty(){return !!this.value.publish||!!this.value.action;}get locked(){return this.value.busy||!!this.value.pending;}
 get stale(){const {publish,setup,action,item}=this.value;return !!publish&&(!setup||setup.expectedVersion!==publish.expectedVersion||setup.sourceReference!==publish.sourceReference)||!!action&&(!item||item.version!==action.expectedVersion||action.action!=='withdraw'&&item.status!=='current');}
 private fail(error:unknown){const status=typeof error==='object'&&error&&'status'in error?Number(error.status):0;this.set({error:error instanceof Error?error.message:'The shared work could not be loaded.',...([401,402,403,404].includes(status)?{board:null,item:null,setup:null,publish:null,review:null,action:null,decision:null,history:null}:{})});}
 async load(){if(this.locked)return;const epoch=++this.epoch;try{const board=await this.api<TransactionTeamBoard>('/transactions/team');if(epoch!==this.epoch||!this.active)return;this.set({board});const current=this.value.item;if(current){const item=await this.api<TransactionTeamItem>(`/transactions/team/${current.id}`);if(epoch!==this.epoch)return;this.set({item,...(item.reference!==current.reference?{decision:null,history:null}:{}),...(item.status!=='current'&&this.value.action?.action!=='withdraw'?{action:null}: {})});}if(this.value.setup){const setup=await this.api<TransactionTeamSetup>(`/transactions/${this.value.setup.transactionId}/team`);if(epoch!==this.epoch)return;const changed=setup.sourceReference!==this.value.setup.sourceReference||setup.expectedVersion!==this.value.setup.expectedVersion;this.set({setup,...(changed?{review:null}:{})});}}catch(error){if(epoch===this.epoch)this.fail(error);}}
 async select(id:string){if(this.locked||this.dirty)return;const epoch=++this.epoch;this.set({busy:true,item:null,setup:null,history:null,error:''});try{const item=await this.api<TransactionTeamItem>(`/transactions/team/${id}`);if(epoch===this.epoch)this.set({item});}catch(error){if(epoch===this.epoch)this.fail(error);}finally{if(epoch===this.epoch)this.set({busy:false});}}
 async share(transactionId:string){if(this.locked||this.dirty)return;const epoch=++this.epoch;this.set({busy:true,error:''});try{const setup=await this.api<TransactionTeamSetup>(`/transactions/${transactionId}/team`);if(epoch===this.epoch)this.set({setup,history:null,item:setup.current,publish:{transactionId,expectedVersion:setup.expectedVersion,sourceReference:setup.sourceReference,memberIds:setup.current?.members.map(m=>m.id)??[],summary:setup.current?.snapshot?.summary??'',milestones:Object.keys(setup.current?.snapshot?.milestones??{}) as TransactionMilestone[],carryTaskIds:[],eventKey:this.key()},review:null,action:null});}catch(error){if(epoch===this.epoch)this.fail(error);}finally{if(epoch===this.epoch)this.set({busy:false});}}
 changePublish(patch:Partial<Pick<TransactionTeamPublish,'memberIds'|'summary'|'milestones'|'carryTaskIds'>>){if(!this.locked&&this.value.publish)this.set({publish:{...this.value.publish,...patch},review:null});}
 toggleMember(id:string){const value=this.value.publish;if(value)this.changePublish({memberIds:value.memberIds.includes(id)?value.memberIds.filter(x=>x!==id):[...value.memberIds,id]});}
 toggleMilestone(key:TransactionMilestone){const value=this.value.publish;if(value)this.changePublish({milestones:value.milestones.includes(key)?value.milestones.filter(x=>x!==key):[...value.milestones,key]});}
 toggleCarry(taskId:string){const value=this.value.publish;if(value)this.changePublish({carryTaskIds:(value.carryTaskIds??[]).includes(taskId)?value.carryTaskIds!.filter(id=>id!==taskId):[...(value.carryTaskIds??[]),taskId]});}
 async review(){if(this.locked||this.stale||!this.value.publish)return;const epoch=++this.epoch;this.set({busy:true,error:''});try{const review=await this.api<TransactionTeamReview>('/transactions/team/review',this.value.publish);if(epoch===this.epoch)this.set({review});}catch(error){if(epoch===this.epoch)this.fail(error);}finally{if(epoch===this.epoch)this.set({busy:false});}}
 confirmPublish(){const review=this.value.review;if(this.locked||this.stale||!review)return;return this.run({path:'/transactions/team/publish',body:{request:review.request,reviewHash:review.reviewHash}});}
 begin(action:TeamActionForm['action'],taskId=''){
  const item=this.value.item;if(this.locked||this.dirty||!item)return;const task=item.tasks.find(t=>t.id===taskId);this.epoch++;
  this.set({history:null,action:{action,taskId,assignedTo:task?.assignedTo??item.members[0]?.id??item.owner.id,instruction:task?.instruction??'',dueDate:task?.dueDate??new Date().toISOString().slice(0,10),kind:'blocked',note:'',source:'',expectedVersion:item.version},decision:null,error:''});
 }
 async showHistory(taskId:string){
  const item=this.value.item;if(this.locked||this.dirty||!item)return;const epoch=++this.epoch;this.set({busy:true,history:null,error:''});
  try{const history=await this.api<TransactionTeamTaskHistory>(`/transactions/team/${item.id}/tasks/${taskId}/history`);if(epoch===this.epoch&&history.reference===this.value.item?.reference)this.set({history});else if(epoch===this.epoch)this.set({error:'Shared work changed. Refresh it before opening the history.'});}
  catch(error){if(epoch===this.epoch)this.fail(error);}finally{if(epoch===this.epoch)this.set({busy:false});}
 }
 closeHistory(){if(!this.locked)this.set({history:null});}
 changeAction(patch:Partial<Omit<TeamActionForm,'action'|'taskId'|'expectedVersion'>>){if(!this.locked&&this.value.action)this.set({action:{...this.value.action,...patch},decision:null});}
 reviewAction(){
  const form=this.value.action;if(this.locked||this.stale||!form)return;const base={expectedVersion:form.expectedVersion,eventKey:this.key()};let decision:TransactionTeamAction;
  if(form.action==='withdraw')decision={...base,action:'withdraw'};
  else if(form.action==='assign')decision={...base,action:'assign',assignedTo:form.assignedTo,instruction:form.instruction,dueDate:form.dueDate};
  else if(form.action==='acknowledge')decision={...base,action:'acknowledge',taskId:form.taskId};
  else if(form.action==='report')decision={...base,action:'report',taskId:form.taskId,kind:form.kind,note:form.note,source:form.source};
  else if(form.action==='change'||form.action==='reopen')decision={...base,action:form.action,taskId:form.taskId,assignedTo:form.assignedTo,instruction:form.instruction,dueDate:form.dueDate,note:form.note};
  else decision={...base,action:form.action,taskId:form.taskId,note:form.note};
  this.set({decision});
 }
 confirmAction(){if(this.locked||this.stale||!this.value.decision||!this.value.item)return;return this.run({path:`/transactions/team/${this.value.item.id}`,body:this.value.decision});}
 discard(){if(!this.locked)this.set({publish:null,review:null,setup:null,action:null,decision:null,error:''});}
 leave(action:()=>void){if(this.locked||this.dirty)this.set({error:this.locked?'Finish or retry this shared update before leaving.':'Save or discard your shared-work changes before leaving.'});else action();}
 retry(){if(!this.value.busy&&this.value.pending)return this.run(this.value.pending);}
 private async run(operation:{path:string;body:unknown}){this.epoch++;this.set({busy:true,pending:operation,error:''});try{const item=await this.api<TransactionTeamItem>(operation.path,operation.body);this.set({item,history:null,pending:null,setup:null,publish:null,review:null,action:null,decision:null});}catch(error){const status=typeof error==='object'&&error&&'status'in error?Number(error.status):0;if([400,401,402,403,404,409,413,422].includes(status))this.set({pending:null,review:null,decision:null});this.fail(error);}finally{this.set({busy:false});if(this.active&&!this.value.pending)await this.load();}}
}
export function teamDecisionText(item:TransactionTeamItem,decision:TransactionTeamAction){
 const task='taskId'in decision?item.tasks.find(t=>t.id===decision.taskId):null;
 const person=(id:string)=>[item.owner,...item.members].find(p=>p.id===id)?.name??'Unavailable teammate';
 let detail:string;
 if(decision.action==='withdraw')detail='Remove teammate access to this shared summary. Private records remain unchanged.';
 else if(decision.action==='assign')detail=`Assign to ${person(decision.assignedTo)}: ${decision.instruction}\nDue ${decision.dueDate}`;
 else if(decision.action==='acknowledge')detail=`Acknowledge: ${task?.instruction}`;
 else if(decision.action==='report')detail=`Employee-reported ${decision.kind}: ${decision.note}\nSource: ${decision.source}`;
 else if(decision.action==='cancel')detail=`Cancel follow-up: ${task?.instruction}\nReason: ${decision.note}\nEarlier reports remain in history. Cancellation is not completion.`;
 else if(decision.action==='change'||decision.action==='reopen'){
  const resets=decision.action==='reopen'||task?.assignedTo!==decision.assignedTo||task?.instruction!==decision.instruction;
  detail=`${decision.action==='reopen'?'Reopen':'Change'} follow-up\nBefore: ${person(task?.assignedTo??'')} · ${task?.instruction} · due ${task?.dueDate} · ${task?.state}\nAfter: ${person(decision.assignedTo)} · ${decision.instruction} · due ${decision.dueDate}\nReason: ${decision.note}\n${resets?'A new acknowledgment is required. Earlier outcomes remain in history and do not carry forward.':'Only the date changes. The existing acknowledgment and report remain current.'}`;
 }else detail=`Resolve follow-up: ${task?.instruction}\nEmployee report: ${task?.report?.note}\nSource: ${task?.report?.source}\nOwner review: ${decision.note}`;
 return [item.snapshot?.address??'Shared transaction',`Coordination version ${decision.expectedVersion}`,detail,'Shared operational record only. No transaction milestone or external outcome is changed.'].join('\n\n');
}

export function teamHistoryText(item:TransactionTeamItem,entry:TransactionTeamTaskHistory['entries'][number]){
 const task=entry.task,person=[item.owner,...item.members].find(p=>p.id===task.assignedTo)?.name??'Former teammate';
 return [`${person} · ${task.instruction} · due ${task.dueDate} · ${task.state}`,task.change?`Change reason: ${task.change.note}`:'',task.report?`Employee report: ${task.report.kind}; ${task.report.note}\nSource: ${task.report.source}`:'',task.resolution?`Owner review: ${task.resolution.note}`:'',task.cancellation?`Cancellation reason: ${task.cancellation.note}`:''].filter(Boolean).join('\n');
}

export function teamHistoryHeading(entry:TransactionTeamTaskHistory['entries'][number]){
 const labels:Record<string,string>={assign:'Assigned',acknowledge:'Acknowledged',report:'Outcome reported',change:'Assignment updated',cancel:'Canceled',resolve:'Resolved',reopen:'Reopened',carried:'Continued in refreshed summary'};
 return `${labels[entry.action]??'Updated'} · ${entry.actorName} · ${new Date(entry.at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}`;
}
