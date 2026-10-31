import type {CommunicationAccount,ComposeCommunication,InboxThreadDetail} from './communications-contracts';
import {parseCc} from './communication-recipients';

export type CompositionFields={accountId:string;name:string;address:string;subject:string;cc:string;body:string};
export const composingAccounts=(accounts:CommunicationAccount[])=>accounts.filter(a=>a.access==='available'&&a.capabilities.localDraft);
/** Shared by web and native: an uncertain save can only retry its exact original request. */
export class CommunicationComposer {
 fields:CompositionFields;
 pending:ComposeCommunication|null=null;
 busy=false;error='';discardReview=false;
 private active=true;
 constructor(readonly accounts:CommunicationAccount[],preferred:string|undefined,private send:(payload:ComposeCommunication)=>Promise<InboxThreadDetail>,private key:()=>string,private changed:()=>void,private saved:(detail:InboxThreadDetail)=>void){
  const usable=composingAccounts(accounts);this.fields={accountId:usable.find(a=>a.id===preferred)?.id??usable[0]?.id??'',name:'',address:'',subject:'',cc:'',body:''};
 }
 get account(){return this.accounts.find(a=>a.id===this.fields.accountId);}
 get locked(){return this.busy||!!this.pending;}
 get dirty(){return !!(this.fields.name||this.fields.address||this.fields.subject||this.fields.cc||this.fields.body);}
 change(patch:Partial<CompositionFields>){if(this.locked)return;this.fields={...this.fields,...patch};this.error='';this.discardReview=false;this.changed();}
 close():boolean {if(this.locked){this.error='Retry the outstanding save to recover its result before closing.';this.changed();return false;}if(this.dirty&&!this.discardReview){this.discardReview=true;this.changed();return false;}return true;}
 stay(){this.discardReview=false;this.changed();}
 activate(){this.active=true;}
 deactivate(){this.active=false;}
 async save(){
  if(this.busy||!this.active)return;
  if(!this.pending){
   const {accountId,name,address,subject,cc,body}=this.fields,account=this.account;
   if(!account||!composingAccounts([account]).length){this.error='Choose an available account.';this.changed();return;}
   if(!address.trim()||!body.trim()||(account.channel==='email'&&!subject.trim())){this.error='Add a recipient, message and email subject before saving.';this.changed();return;}
   if(account.channel==='sms'&&(cc.trim()||subject.trim())){this.error='Clear the email subject and CC before saving a one-to-one text.';this.changed();return;}
   this.pending={accountId,to:{name:name.trim(),address:address.trim()},body,...(account.channel==='email'?{subject,cc:parseCc(cc)}:{}),eventKey:this.key()};
  }
  this.busy=true;this.error='';this.changed();
  try{const detail=await this.send(this.pending);if(!this.active)return;this.pending=null;this.busy=false;this.saved(detail);}
  catch(error){if(!this.active)return;const status=typeof error==='object'&&error!==null&&'status'in error?Number(error.status):0;
   if([400,401,402,403,404,409,422].includes(status))this.pending=null;
   this.error=error instanceof Error?error.message:'The draft could not be saved.';
  }finally{if(this.active){this.busy=false;this.changed();}}
 }
}
