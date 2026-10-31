import {knowledgeForm,knowledgeInput,type KnowledgeForm,type KnowledgeReview,type KnowledgeWorkspace} from './knowledge-contracts';
type Request=<T>(path:string,payload?:unknown)=>Promise<T>;
interface State {workspace:KnowledgeWorkspace|null;selected:string|null;form:KnowledgeForm|null;base:number;review:KnowledgeReview|null;answer:string;answerReference:string;reason:string;busy:boolean;error:string;pending:{path:string;payload:unknown}|null}
/** Shared surface state without a React dependency; native and web use the same retry and stale-source rules. */
export class KnowledgeController {
 value:State={workspace:null,selected:null,form:null,base:0,review:null,answer:'',answerReference:'',reason:'',busy:false,error:'',pending:null};
 private listeners=new Set<(state:State)=>void>();private epoch=0;private active=true;
 constructor(private request:Request,private id:()=>string,private authError:(e:unknown)=>void=()=>{},initialId?:string|null){this.value.selected=initialId??null;}
 subscribe(listener:(state:State)=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 activate(){this.active=true;}
 dispose(){this.active=false;this.epoch++;}
 private update(patch:Partial<State>){if(!this.active)return;this.value={...this.value,...patch};for(const listener of this.listeners)listener(this.value);}
 get locked(){return this.value.busy||!!this.value.pending;}
 get dirty(){return !!this.value.form||!!this.value.answer||!!this.value.reason||!!this.value.review;}
 get document(){return this.value.workspace?.documents.find(d=>d.id===this.value.selected);}
 get guide(){return this.value.workspace?.guides.find(g=>g.documentId===this.value.selected);}
 get stale(){return !!this.value.form&&(this.document?.version??0)!==this.value.base;}
 get practiceStale(){return !!this.value.answer&&this.value.answerReference!==this.guide?.reference;}
 private fail(error:unknown){this.authError(error);const status=typeof error==='object'&&error!==null&&'status' in error?Number(error.status):0;this.update({error:error instanceof Error?error.message:'Guidance request failed.',...([401,402,403,404].includes(status)?{workspace:null,review:null,form:null,answer:'',answerReference:'',reason:''}:{}),...(status>=400&&status<500?{pending:null}:{} )});}
 async load(){if(this.locked)return;const ticket=++this.epoch;try{const workspace=await this.request<KnowledgeWorkspace>('/knowledge');if(this.active&&ticket===this.epoch)this.update({workspace});}catch(e){if(this.active&&ticket===this.epoch)this.fail(e);}}
 select(id:string){if(this.locked||this.dirty){this.update({error:'Save, discard or retry the current changes before switching guides.'});return;}this.update({selected:id,error:''});}
 edit(fresh=false){if(this.locked||this.dirty)return;const doc=fresh?undefined:this.document;if(!fresh&&!doc)return;this.update({selected:doc?.id??null,base:doc?.version??0,form:knowledgeForm(doc?.draft),review:null,error:''});}
 change(patch:Partial<KnowledgeForm>){if(this.locked||!this.value.form)return;this.update({form:{...this.value.form,...patch},review:null});}
 answer(answer:string){if(this.locked||!this.guide)return;this.update({answer,answerReference:this.value.answer?this.value.answerReference:this.guide.reference});}
 reason(reason:string){if(!this.locked)this.update({reason});}
 discard(){if(this.locked)return;this.update({form:null,review:null,answer:'',answerReference:'',reason:'',error:''});}
 leave(action:()=>void){if(this.locked||this.dirty)this.update({error:'Save, discard or retry your guidance changes before leaving.'});else action();}
 async review(){if(this.locked||this.dirty||!this.document)return;this.update({busy:true,error:''});this.epoch++;try{const review=await this.request<KnowledgeReview>('/knowledge/review',{id:this.document.id,expectedVersion:this.document.version});this.update({review});}catch(e){this.fail(e);}finally{this.update({busy:false});}}
 async mutate(path:string,payload:unknown){if(this.value.busy)return;this.update({busy:true,error:'',pending:{path,payload}});this.epoch++;try{const workspace=await this.request<KnowledgeWorkspace>(path,payload);this.update({workspace,selected:workspace.selectedDocumentId??this.value.selected,pending:null,form:null,review:null,answer:'',answerReference:'',reason:''});}catch(e){this.fail(e);}finally{this.update({busy:false});}}
 save(){if(this.locked||!this.value.form||this.stale)return;return this.mutate('/knowledge/draft',{id:this.value.selected,expectedVersion:this.value.base,input:knowledgeInput(this.value.form),eventKey:this.id()});}
 publish(){if(this.locked||!this.value.review)return;const r=this.value.review;return this.mutate('/knowledge/publish',{id:r.document.id,expectedVersion:r.document.version,reviewReference:r.reviewReference,eventKey:this.id()});}
 withdraw(){if(this.locked||!this.document||!this.value.reason.trim())return;return this.mutate('/knowledge/withdraw',{id:this.document.id,expectedVersion:this.document.version,reason:this.value.reason,eventKey:this.id()});}
 practice(){if(this.locked||!this.guide||!this.value.answer.trim()||this.practiceStale)return;return this.mutate('/knowledge/practice',{documentId:this.guide.documentId,knowledgeAccessReference:this.value.answerReference,answer:this.value.answer,eventKey:this.id()});}
 retry(){const p=this.value.pending;if(p&&!this.value.busy)return this.mutate(p.path,p.payload);}
}
