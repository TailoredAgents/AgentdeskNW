import {emptyTransaction,type TransactionBoard,type TransactionDetail,type TransactionInput,type TransactionRecord} from './transaction-contracts';
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
type Operation={path:string;body:unknown};
// Transaction inputs contain JSON-safe strings, booleans, arrays and nulls on every client.
const copyInput=(value:TransactionInput)=>JSON.parse(JSON.stringify(value)) as TransactionInput;
export interface TransactionWorkspace {board:TransactionBoard|null;detail:TransactionDetail|null;form:TransactionInput|null;baseVersion:number;historical:TransactionRecord|null;pending:Operation|null;busy:boolean;error:string}
export class TransactionController {
 value:TransactionWorkspace={board:null,detail:null,form:null,baseVersion:0,historical:null,pending:null,busy:false,error:''};
 private listeners=new Set<(value:TransactionWorkspace)=>void>();private active=true;private epoch=0;
 constructor(private api:Api,private key:()=>string){}
 activate(){this.active=true;}dispose(){this.active=false;this.epoch++;}
 subscribe(fn:(value:TransactionWorkspace)=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private update(patch:Partial<TransactionWorkspace>){if(!this.active)return;this.value={...this.value,...patch};this.listeners.forEach(fn=>fn(this.value));}
 get dirty(){return !!this.value.form;}
 get locked(){return this.value.busy||!!this.value.pending;}
 get stale(){return !!this.value.form&&this.value.baseVersion!==(this.value.detail?.record.version??0);}
 private failure(error:unknown){const status=typeof error==='object'&&error!==null&&'status'in error?Number(error.status):0;this.update({error:error instanceof Error?error.message:'Transaction request failed.',...([401,402,403,404].includes(status)?{board:null,detail:null,form:null,historical:null}:{})});}
 async load(){if(this.locked)return;const epoch=++this.epoch,id=this.value.detail?.record.id;try{
  const board=await this.api<TransactionBoard>('/transactions');if(!this.active||epoch!==this.epoch)return;this.update({board});
  if(id){const detail=await this.api<TransactionDetail>(`/transactions/${encodeURIComponent(id)}`);if(!this.active||epoch!==this.epoch)return;this.update({detail});}
  const form=this.value.form;if(form&&(form.propertyId&&!board.properties.some(p=>p.id===form.propertyId)||form.investorId&&!board.investors.some(i=>i.id===form.investorId)))this.update({form:null,historical:null,error:'A linked source is no longer available. Reopen an authorized transaction.'});
 }catch(error){if(epoch===this.epoch)this.failure(error);}}
 async select(id:string){if(this.locked||this.dirty)return;const epoch=++this.epoch;this.update({busy:true,error:'',detail:null,historical:null});try{const detail=await this.api<TransactionDetail>(`/transactions/${encodeURIComponent(id)}`);if(epoch===this.epoch)this.update({detail});}catch(error){if(epoch===this.epoch)this.failure(error);}finally{if(epoch===this.epoch)this.update({busy:false});}}
 edit(create=false){if(this.locked||this.dirty||!this.value.board?.canEdit)return;const detail=create?null:this.value.detail;if(!create&&!detail)return;this.epoch++;this.update({detail,baseVersion:detail?.record.version??0,form:detail?copyInput(detail.record.input):emptyTransaction(),historical:null,error:''});}
 change(patch:Partial<TransactionInput>){if(this.locked||!this.value.form)return;this.update({form:{...this.value.form,...patch}});}
 historical(version:number){if(this.locked||this.dirty)return;this.update({historical:this.value.detail?.history.find(item=>item.version===version)??null});}
 current(){if(!this.locked)this.update({historical:null});}
 discard(){if(!this.locked)this.update({form:null,error:''});}
 leave(action:()=>void){if(this.dirty||this.locked){this.update({error:this.locked?'Finish or retry this transaction update before leaving.':'Save or discard transaction changes before leaving.'});return;}action();}
 save(){if(this.locked||this.stale||!this.value.form)return;return this.run({path:'/transactions/save',body:{id:this.value.detail?.record.id??null,expectedVersion:this.value.baseVersion,input:copyInput(this.value.form),eventKey:this.key()}});}
 retry(){if(!this.value.busy&&this.value.pending)return this.run(this.value.pending);}
 private async run(operation:Operation){this.epoch++;this.update({busy:true,pending:operation,error:''});try{const detail=await this.api<TransactionDetail>(operation.path,operation.body);if(!this.active)return;this.update({detail,pending:null,form:null,historical:null});}catch(error){if(!this.active)return;const status=typeof error==='object'&&error!==null&&'status'in error?Number(error.status):0;if([400,401,402,403,404,409,413,422].includes(status))this.update({pending:null});this.failure(error);}finally{this.update({busy:false});if(this.active&&!this.value.pending)await this.load();}}
}
