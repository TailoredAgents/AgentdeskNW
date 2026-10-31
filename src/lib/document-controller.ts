import type {DocumentImportPreview,DocumentOriginal,SourceDocumentBoard,SourceDocumentDetail,SourceDocumentInput} from './document-contracts';
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
type Operation={path:string;body:unknown};
export interface DocumentWorkspace {board:SourceDocumentBoard|null;detail:SourceDocumentDetail|null;form:SourceDocumentInput|null;baseVersion:number;reason:string;withdrawReview:boolean;imported:DocumentImportPreview|null;historical:{revision:number;input:SourceDocumentInput;original?:DocumentOriginal}|null;pending:Operation|null;busy:boolean;error:string}
export class DocumentController {
 value:DocumentWorkspace={board:null,detail:null,form:null,baseVersion:0,reason:'',withdrawReview:false,imported:null,historical:null,pending:null,busy:false,error:''};
 private listeners=new Set<(state:DocumentWorkspace)=>void>();private active=true;private epoch=0;private refreshing=false;
 constructor(private api:Api,private key:()=>string){}
 activate(){this.active=true;}dispose(){this.active=false;this.epoch++;}
 subscribe(fn:(state:DocumentWorkspace)=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private update(patch:Partial<DocumentWorkspace>){if(!this.active)return;this.value={...this.value,...patch};this.listeners.forEach(fn=>fn(this.value));}
 get dirty(){return !!this.value.form||!!this.value.reason;}
 get locked(){return this.value.busy||!!this.value.pending;}
 get stale(){return !!this.value.form&&this.value.baseVersion!==(this.value.detail?.document.version??0);}
 private failure(error:unknown){const status=typeof error==='object'&&error!==null&&'status'in error?Number(error.status):0;this.update({error:error instanceof Error?error.message:'Document request failed.',...([401,402,403,404].includes(status)?{board:null,detail:null,form:null,imported:null,historical:null,withdrawReview:false,reason:''}:{} )});}
 async load(){if(this.locked||this.refreshing)return;this.refreshing=true;const epoch=++this.epoch,id=this.value.detail?.document.id;
  try{const board=await this.api<SourceDocumentBoard>('/documents');if(!this.active||epoch!==this.epoch)return;this.update({board});
   if(id){const detail=await this.api<SourceDocumentDetail>(`/documents/${encodeURIComponent(id)}`);if(!this.active||epoch!==this.epoch)return;const changed=detail.reference!==this.value.detail?.reference||detail.document.version!==this.value.detail?.document.version;this.update({detail,...(changed?{historical:null,withdrawReview:false}:{})});}
   const form=this.value.form;if(form&&(form.propertyId&&!board.properties.some(p=>p.id===form.propertyId)||form.investorId&&!board.investors.some(i=>i.id===form.investorId)))this.update({form:null,imported:null,historical:null,withdrawReview:false,reason:'',error:'A linked source is no longer available. Reopen an authorized document.'});
  }catch(e){if(this.active&&epoch===this.epoch)this.failure(e);}finally{this.refreshing=false;}
 }
 async select(id:string){if(this.locked||this.dirty)return;const epoch=++this.epoch;this.update({busy:true,error:'',detail:null,historical:null,withdrawReview:false});try{const detail=await this.api<SourceDocumentDetail>(`/documents/${encodeURIComponent(id)}`);if(this.active&&epoch===this.epoch)this.update({detail});}catch(e){if(epoch===this.epoch)this.failure(e);}finally{if(epoch===this.epoch)this.update({busy:false});}}
 edit(create=false){if(this.locked||this.dirty||!this.value.board?.canEdit)return;const detail=create?null:this.value.detail;if(!create&&!detail)return;this.epoch++;this.update({detail,baseVersion:detail?.document.version??0,form:detail?{...detail.input}:{title:'',fileName:'source.txt',purpose:'other',sourceLabel:'',sourceDate:new Date().toISOString().slice(0,10),propertyId:null,investorId:null,content:''},historical:null,error:'',withdrawReview:false});}
 change(patch:Partial<SourceDocumentInput>){if(this.locked||!this.value.form)return;this.update({form:{...this.value.form,...patch}});}
 async importPdf(fileName:string,base64:string){
  if(this.locked||!this.value.form)return;const epoch=++this.epoch,previous=this.value.imported;
  this.update({busy:true,error:''});
  try{const imported=await this.api<DocumentImportPreview>('/documents/import',{fileName,base64});if(!this.active||epoch!==this.epoch)return;
   this.update({imported,form:{...this.value.form!,fileName:imported.fileName,content:imported.content}});
   if(previous)void this.api('/documents/discard-import',{id:previous.id}).catch(()=>{});
  }catch(e){if(this.active&&epoch===this.epoch)this.failure(e);}finally{if(epoch===this.epoch)this.update({busy:false});}
 }
 reason(reason:string){if(!this.locked&&!this.value.form)this.update({reason,withdrawReview:false});}
 reviewWithdrawal(){if(!this.locked&&this.value.reason.trim()&&this.value.detail&&!this.value.detail.document.withdrawn)this.update({withdrawReview:true});}
 discard(){if(!this.locked){const imported=this.value.imported;if(imported)void this.api('/documents/discard-import',{id:imported.id}).catch(()=>{});this.update({form:null,imported:null,reason:'',withdrawReview:false,error:''});}}
 leave(action:()=>void){if(this.locked||this.dirty){this.update({error:this.locked?'Finish or retry the document action before leaving.':'Save or discard your document changes before leaving.'});return;}action();}
 async historical(revision:number){if(this.locked||this.dirty||!this.value.detail)return;const id=this.value.detail.document.id,epoch=++this.epoch;this.update({busy:true,error:''});try{const value=await this.api<{revision:number;input:SourceDocumentInput}>(`/documents/${encodeURIComponent(id)}/revision?revision=${revision}`);if(epoch===this.epoch)this.update({historical:value});}catch(e){if(epoch===this.epoch)this.failure(e);}finally{if(epoch===this.epoch)this.update({busy:false});}}
 current(){if(!this.locked)this.update({historical:null});}
 save(){if(this.locked||!this.value.form||this.stale)return;return this.run({path:'/documents/save',body:{id:this.value.detail?.document.id??null,expectedVersion:this.value.baseVersion,input:this.value.form,...(this.value.imported?{importId:this.value.imported.id}:{}),eventKey:this.key()}});}
 withdraw(){if(this.locked||!this.value.withdrawReview||!this.value.detail)return;return this.run({path:'/documents/withdraw',body:{id:this.value.detail.document.id,expectedVersion:this.value.detail.document.version,reason:this.value.reason,eventKey:this.key()}});}
 retry(){if(this.value.pending&&!this.value.busy)return this.run(this.value.pending);}
 private async run(operation:Operation){this.epoch++;this.update({pending:operation,busy:true,error:''});try{const detail=await this.api<SourceDocumentDetail>(operation.path,operation.body);if(!this.active)return;this.update({detail,pending:null,form:null,imported:null,reason:'',withdrawReview:false,historical:null});}catch(e){if(!this.active)return;const status=typeof e==='object'&&e!==null&&'status'in e?Number(e.status):0;if([400,401,402,403,404,409,413,422].includes(status))this.update({pending:null});this.failure(e);}finally{this.update({busy:false});if(this.active&&!this.value.pending){await this.load();}}}
}
