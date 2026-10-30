import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Actor,Artifact,ToolResult} from '../lib/contracts';
import type {WorkRun,WorkStepInput} from '../lib/work-contracts';
import type {WorkConversationOptions,WorkConversationCostReview} from '../lib/work-conversation-contracts';
import {AppError,getDb,now,scopedGet} from './db';
import {requireFeature} from './billing';
import {assertInboxToolResultVisible,readHistoryMessage,type StoredMessage} from './history';
import {readInvestor,readProperty} from './access';
import {listInvestors} from './services';
import {controlWorkRun,decideWorkCost,getWorkRun,listWorkRuns,reviseWorkRun} from './work-runs';
import {buildWorkPreset} from './work-presets';
import {conversationLink} from './messaging-config';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
const terminal=new Set(['completed','canceled']);
export const workConversationReference=(id:string)=>`W${hash(id).slice(0,8).toUpperCase()}`;
const artifact=(run:WorkRun):Artifact=>({type:'work_run',id:run.id,title:run.title,data:{workRunId:run.id,workPlanVersion:run.planVersion}});
const reply=(message:string,runs:WorkRun[]=[]):ToolResult=>({specialistIds:[],message,artifacts:runs.map(artifact)});
const clean=(message:string)=>message.trim().replaceAll('’',"'").replace(/[.!?]+$/,'').replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,'');
interface Intent {action:'list'|'status'|'review'|'pause'|'resume'|'cancel'|'approve'|'deny'|'add_research'|'remove_research'|'investor'|'unsupported'|'decision_help';target:string;investor?:string}
/** Only the actual employee's complete command is parsed; quoted or hypothetical text is not authority. */
export function workConversationIntent(message:string):Intent|null {
 const text=clean(message);let match:RegExpExecArray|null;
 if(/^(?:show|list|check)(?: me)?(?: my| the)? (?:copilot |saved |work )?jobs$/i.test(text))return {action:'list',target:''};
 if((match=/^(approve|deny)\s+(A[0-9a-f]{8})$/i.exec(text)))return {action:match[1].toLowerCase() as 'approve'|'deny',target:match[2].toUpperCase()};
 if(/^(?:yes|approve|deny|approve (?:it|that|the cost|the job)|deny (?:it|that|the cost|the job))$/i.test(text))return {action:'decision_help',target:''};
 if((match=/^(?:review|show)(?: the)? (?:cost|estimate)(?: for| of)? (?:job\s+)?(.+)$/i.exec(text)))return {action:'review',target:match[1]};
 if((match=/^(?:show|check)(?: the)? (?:status|progress)(?: of| for)? (?:job\s+)?(.+)$/i.exec(text)))return {action:'status',target:match[1]};
 if((match=/^(?:status|review)\s+((?:W[0-9a-f]{8}|work_[0-9a-f-]+))$/i.exec(text)))return {action:text.toLowerCase().startsWith('review')?'review':'status',target:match[1]};
 if((match=/^(show|review|pause|resume|continue|cancel|stop|refresh)\s+(?:(?:the|my|that|this)\s+)?(?:copilot\s+|saved\s+)?(?:job|work job)(?:\s+(.+))?$/i.exec(text))){const action=match[1].toLowerCase();return {action:action==='show'?'status':action==='continue'||action==='refresh'?'resume':action==='stop'?'cancel':action as Intent['action'],target:match[2]??''};}
 if((match=/^(pause|resume|continue|cancel|stop)\s+(W[0-9a-f]{8}|work_[0-9a-f-]+|it|that|this)$/i.exec(text))){const action=match[1].toLowerCase();return {action:action==='continue'?'resume':action==='stop'?'cancel':action as Intent['action'],target:match[2]};}
 if((match=/^(add|remove)(?: fictional| synthetic| new-investor)? research (?:to|from) (?:job\s+)?(.+)$/i.exec(text)))return {action:match[1].toLowerCase()==='add'?'add_research':'remove_research',target:match[2]};
 if((match=/^(?:change|set)(?: the| selected)? investor (?:for|on) (?:job\s+)?(.+?) to (.+)$/i.exec(text)))return {action:'investor',target:match[1],investor:match[2]};
 if(/^(?:change|revise|update|edit) (?:the |my |that |this )?job\b/i.test(text))return {action:'unsupported',target:''};
 return null;
}
function focusedRun(actor:Actor,conversationId:string,options:WorkConversationOptions):WorkRun|null {
 const row=getDb().prepare("SELECT data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=? AND json_extract(data,'$.role')='assistant' ORDER BY sequence DESC LIMIT 1").get(conversationId,...owner(actor)) as {data:string}|undefined;
 if(!row)return null;const saved=JSON.parse(row.data) as StoredMessage,visible=readHistoryMessage(actor,saved);
 if(options.receivedAt&&Date.parse(saved.createdAt)>=Date.parse(options.receivedAt))return null;
 const artifacts=visible.artifacts.filter(item=>item.type==='work_run');
 if(artifacts.length!==1||!artifacts[0].id||visible.artifacts.some(item=>item.type==='task'||item.type==='job'))return null;
 const original=saved.artifacts.find(item=>item.type==='work_run'&&item.id===artifacts[0].id),reference=original?.data as {workPlanVersion?:number}|undefined;
 if(!reference?.workPlanVersion)return null;
 const channelTurn=getDb().prepare(`SELECT a.request_id FROM assistant_turns a JOIN messaging_inbox i ON a.request_id='channel:'||i.id JOIN messaging_links l ON l.id=i.link_id
  WHERE a.organization_id=? AND a.office_id=? AND a.user_id=? AND a.conversation_id=? AND json_extract(a.result,'$.messageId')=?
  AND l.organization_id=a.organization_id AND l.office_id=a.office_id AND l.user_id=a.user_id`).get(...owner(actor),conversationId,saved.id) as {request_id:string}|undefined;
 if(channelTurn){
  const receipt=getDb().prepare(`SELECT o.updated_at FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id WHERE o.reference_id=? AND o.kind='reply' AND o.status IN ('accepted','delivered') AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND l.active=1 AND l.opted_out=0 ORDER BY o.updated_at LIMIT 1`).get(saved.id,...owner(actor)) as {updated_at:string}|undefined;
  if(!receipt||options.receivedAt&&Date.parse(receipt.updated_at)>=Date.parse(options.receivedAt))return null;
 }
 const run=getWorkRun(actor,artifacts[0].id);return !run.contentRestricted&&run.planVersion===reference.workPlanVersion?run:null;
}
function resolveRun(actor:Actor,target:string,conversationId:string,options:WorkConversationOptions):WorkRun|null {
 if(/^work_[a-f0-9-]+$/i.test(target))return getWorkRun(actor,target);
 if(/^W[0-9a-f]{8}$/i.test(target)){
  const ids=getDb().prepare('SELECT id FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=?').all(...owner(actor)) as {id:string}[];
  const matches=ids.filter(row=>workConversationReference(row.id)===target.toUpperCase());if(matches.length!==1)return null;return getWorkRun(actor,matches[0].id);
 }
 if(!target||/^(?:it|that|this|the job|my job|that job|this job)$/i.test(target))return focusedRun(actor,conversationId,options);
 const matches=listWorkRuns(actor).filter(run=>!run.contentRestricted&&run.title.toLowerCase()===target.toLowerCase());return matches.length===1?matches[0]:null;
}
function choose(actor:Actor,lead='Which saved job do you mean?'):ToolResult {
 const runs=listWorkRuns(actor).filter(run=>!run.contentRestricted&&!terminal.has(run.status)).slice(0,8);
 return reply(`${lead}\n${runs.length?runs.map(run=>`${workConversationReference(run.id)} — ${run.title} (${run.status.replaceAll('_',' ')})`).join('\n'):'No active saved jobs are available.'}\nUse its reference, for example “Pause job W1234ABCD”. Nothing was changed.`,runs);
}
function statusResult(run:WorkRun,prefix=''):ToolResult {
 const code=workConversationReference(run.id),completed=run.steps.filter(step=>step.status==='completed').length;
 return {...reply(`${prefix?`${prefix}\n`:''}${code} — ${run.title}: ${run.status.replaceAll('_',' ')}. ${completed}/${run.steps.length} steps complete.\nSimulated credits: ${money(run.budget.spentCents)} spent; ${money(run.budget.reservedCents)} held; ${money(run.budget.maximumCents)} maximum.${run.lastError?`\n${run.lastError}`:''}${run.status==='waiting_cost_approval'?`\nSay “Review job ${code}” for the exact scope and cost decision.`:''}`, [run]),data:{run}};
}
function resultValue(run:WorkRun,value:unknown,seen=new Set<string>()):unknown {
 if(!value||typeof value!=='object'||!('$step' in value)||!('path' in value))return value;
 const reference=value as {$step:string;path:string};if(seen.has(reference.$step))return undefined;const step=run.steps.find(item=>item.key===reference.$step);if(!step)return undefined;
 const next=new Set([...seen,reference.$step]);let result:unknown=step.result?.data;
 for(const part of reference.path.split('.')){if(!result||typeof result!=='object'||!Object.hasOwn(result,part))return ['propertyId','investorId'].includes(reference.path)?resultValue(run,(step.resolvedInput??step.input)[reference.path],next):undefined;result=(result as Record<string,unknown>)[part];}
 return result;
}
function reviewScope(actor:Actor,run:WorkRun):string {
 const labels:Record<string,string>={inspect_property:'Property facts',match_existing_buyers:'Existing buyers',relationship_next_step:'Relationship',review_handoff:'Handoff review',office_priorities:'Office priorities',create_followup:'Personal task',start_synthetic_research:'Fictional research',await_synthetic_research:'Collect research'};
 const targets=new Map<string,string>(),definitions:string[]=[];
 const target=(kind:'property'|'investor',id:string)=>{const key=`${kind}:${id}`;if(targets.has(key))return targets.get(key)!;const label=`${kind==='property'?'P':'I'}${[...targets.keys()].filter(item=>item.startsWith(kind+':')).length+1}`;const name=kind==='property'?readProperty(actor,id).address:readInvestor(actor,id).name;targets.set(key,label);definitions.push(`${label}: ${name}`);return label;};
 const steps=run.steps.map((step,index)=>{
  const input=step.resolvedInput??step.input,details:string[]=[];
  for(const field of ['propertyId','investorId'] as const){const value=resultValue(run,input[field]);if(typeof value==='string')details.push(target(field==='propertyId'?'property':'investor',value));else if(input[field]&&typeof input[field]==='object')details.push(`${field==='propertyId'?'property':'investor'} from prior result`);}
  if(typeof input.limit==='number')details.push(`${input.limit} prospects`);
  if(typeof input.title==='string')details.push(`“${input.title}”`);
  if('dueAt' in input)details.push(typeof input.dueAt==='string'?`due ${input.dueAt}`:'no due date');
  if('jobId' in input){const ref=input.jobId as {$step?:string};details.push(ref?.$step?`from step ${run.steps.findIndex(item=>item.key===ref.$step)+1}`:'saved child result');}
  return `${index+1}. ${labels[step.capabilityId]??step.capabilityId}${details.length?` [${details.join('; ')}]`:''}: ${step.status==='completed'?'done':`${money(step.maximumCents)} max`}`;
 });
 return [...definitions,...steps].join('\n');
}
interface ReviewRow {code:string;run_id:string;request_id:string;run_version:number;plan_version:number;quote_id:string;maximum_cents:number;channel:string;created_at:string;expires_at:string;result:string}
function reviewCost(actor:Actor,run:WorkRun,conversationId:string,requestId:string,options:WorkConversationOptions):ToolResult {
 if(run.contentRestricted)throw new AppError(403,'Current source access is required to review this job.');
 if(run.status!=='waiting_cost_approval')return statusResult(run,'This job is not waiting for cost approval.');
 if(Date.parse(run.budget.expiresAt)<=Date.now())return statusResult(run,`The estimate expired. Say “Refresh job ${workConversationReference(run.id)}”, then review it again.`);
 const code=`A${randomBytes(4).toString('hex').toUpperCase()}`,channel=options.channel??'web';
 const message=`Job ${workConversationReference(run.id)}, plan ${run.planVersion}\n${reviewScope(actor,run)}\nSimulated credits: estimated ${money(run.budget.estimatedCents)}, maximum ${money(run.budget.maximumCents)}, spent ${money(run.budget.spentCents)}.\nNo investor messages or CRM changes. Expires ${run.budget.expiresAt}.\nApprove ${code} / Deny ${code}`;
 const url=conversationLink(conversationId);if((channel==='sms'||channel==='slack')&&message.length+(url?url.length+2:0)>(channel==='sms'?700:3500))return reply(`The exact scope for job ${workConversationReference(run.id)} is too long for this channel. Open your ongoing Copilot conversation in AgentDesk and say “Review job ${workConversationReference(run.id)}” to review all targets and the ${money(run.budget.maximumCents)} simulated maximum. No cost decision was created here.`,[run]);
 const review:WorkConversationCostReview={code,runId:run.id,runVersion:run.version,planVersion:run.planVersion,quoteId:run.budget.quoteId,maximumCents:run.budget.maximumCents,expiresAt:run.budget.expiresAt,approveCommand:`Approve ${code}`,denyCommand:`Deny ${code}`};
 const result={...reply(message,[run]),data:{review,run}};
 getDb().prepare('INSERT INTO work_conversation_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(code,...owner(actor),conversationId,run.id,requestId,run.version,run.planVersion,run.budget.quoteId,run.budget.maximumCents,channel,now(),run.budget.expiresAt,JSON.stringify(result));return result;
}
function decide(actor:Actor,intent:Intent,conversationId:string,requestId:string,options:WorkConversationOptions):ToolResult {
 const row=getDb().prepare('SELECT * FROM work_conversation_reviews WHERE code=? AND organization_id=? AND office_id=? AND user_id=? AND conversation_id=?').get(intent.target,...owner(actor),conversationId) as ReviewRow|undefined;
 if(!row)throw new AppError(404,'That cost review is not available in this conversation. Ask to review the intended job.');
 const receivedAt=options.receivedAt?Date.parse(z.string().datetime({offset:true}).parse(options.receivedAt)):Date.now();
 if(receivedAt>Date.now()||options.receivedAt&&receivedAt<=Date.parse(row.created_at))throw new AppError(409,'This message predates the cost review. Review the current job before deciding.');
 if(Date.parse(row.expires_at)<=Date.now())throw new AppError(409,'This cost review expired. Refresh and review the job again.');
 if((options.channel==='sms'||options.channel==='slack')&&(row.channel==='sms'||row.channel==='slack')){
  const receipt=getDb().prepare(`SELECT o.updated_at FROM assistant_turns a JOIN messaging_outbox o ON o.reference_id=json_extract(a.result,'$.messageId') JOIN messaging_links l ON l.id=o.link_id WHERE a.organization_id=? AND a.office_id=? AND a.user_id=? AND a.conversation_id=? AND a.request_id=? AND a.status='completed' AND o.kind='reply' AND o.status IN ('accepted','delivered') AND l.organization_id=a.organization_id AND l.office_id=a.office_id AND l.user_id=a.user_id AND l.active=1 AND l.opted_out=0 ORDER BY o.updated_at LIMIT 1`).get(...owner(actor),conversationId,row.request_id) as {updated_at:string}|undefined;
  if(!receipt||Date.parse(receipt.updated_at)>=receivedAt)throw new AppError(409,'The exact cost review has not been confirmed available before this message. Open the job in AgentDesk to review it.');
 }
 const run=getWorkRun(actor,row.run_id);
 if(run.contentRestricted)throw new AppError(403,'Source access changed. This cost review cannot be used.');
 if(run.version!==row.run_version||run.planVersion!==row.plan_version||run.budget.quoteId!==row.quote_id||run.budget.maximumCents!==row.maximum_cents)throw new AppError(409,'This job or estimate changed after review. Review its current scope before deciding.');
 const next=decideWorkCost(actor,run.id,{expectedVersion:row.run_version,quoteId:row.quote_id,eventKey:`conversation:${hash({conversationId,requestId})}`,decision:intent.action as 'approve'|'deny'});
 return statusResult(next,intent.action==='approve'?`Approved this plan up to ${money(row.maximum_cents)} in simulated credits.`:'Cost declined. Remaining work is canceled.');
}
function revise(actor:Actor,run:WorkRun,intent:Intent,conversationId:string,requestId:string):ToolResult {
 if(run.contentRestricted)throw new AppError(403,'Current source access is required to revise this job.');
 if(actor.role!=='dispositions')return reply('These conversational edits currently apply to the dispositions starter. Other instruction changes need a reviewed plan revision; nothing was changed.',[run]);
 const property=run.steps.find(step=>step.key==='property'&&step.capabilityId==='inspect_property'),relationship=run.steps.find(step=>step.key==='relationship'&&step.capabilityId==='relationship_next_step');
 const propertyId=property?.input.propertyId,investorId=relationship?.input.investorId;
 if(typeof propertyId!=='string'||investorId!==undefined&&typeof investorId!=='string')return reply('This is a custom work plan. Use a reviewed plan revision for that change; nothing was changed.',[run]);
 const current=buildWorkPreset(actor,{presetId:'dispositions',propertyId,investorId,includeResearch:run.steps.some(step=>step.capabilityId==='start_synthetic_research')});
 const plain=(steps:WorkStepInput[])=>JSON.stringify(steps.map(step=>({key:step.key,capabilityId:step.capabilityId,input:step.input,dependsOn:step.dependsOn})));
 if(plain(current.steps)!==plain(run.steps))return reply('This job differs from the supported starter plan. A reviewed custom revision is needed; nothing was changed.',[run]);
 let nextInvestor=investorId as string|undefined;
 if(intent.action==='investor'){
  const name=intent.investor!.trim().toLowerCase();const matches=listInvestors(actor).filter(item=>item.id.toLowerCase()===name||item.name.toLowerCase()===name);if(matches.length!==1)return reply('Give the full name of one investor you can access. Nothing was changed.',[run]);nextInvestor=matches[0].id;
 }
 const includeResearch=intent.action==='add_research'?true:intent.action==='remove_research'?false:run.steps.some(step=>step.capabilityId==='start_synthetic_research');
 const next=buildWorkPreset(actor,{presetId:'dispositions',propertyId,investorId:nextInvestor,includeResearch});
 if(plain(next.steps)===plain(run.steps))return statusResult(run,'That scope is already saved; nothing changed.');
 for(const step of run.steps.filter(item=>item.status==='completed'||item.status==='running'))if(!next.steps.some(item=>plain([item])===plain([step])))return reply('That change would alter work already completed or executing. Completed results must stay intact. Cancel remaining work or prepare a separate reviewed job; nothing was changed.',[run]);
 const result=reviseWorkRun(actor,run.id,{expectedVersion:run.version,eventKey:`conversation:${hash({conversationId,requestId})}`,...next});return statusResult(result,'Remaining work revised. The new whole-job estimate replaces the previous review.');
}
/** Invoke before the model with the authenticated employee message; never expose as a model tool. */
export function executeWorkConversationAction(actor:Actor,message:string,conversationId:string,requestId:string,options:WorkConversationOptions={}):ToolResult|null {
 const intent=workConversationIntent(message);if(!intent)return null;
 scopedGet(actor,'conversations',conversationId,true);requireFeature(actor,'core');z.string().min(1).max(150).parse(requestId);
 if(/^(?:pause|resume|continue|cancel|stop)\s+(?:it|that|this)$/i.test(clean(message))){
  const row=getDb().prepare("SELECT data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=? AND json_extract(data,'$.role')='assistant' ORDER BY sequence DESC LIMIT 1").get(conversationId,...owner(actor)) as {data:string}|undefined;
  // A withheld job still owns this ambiguous pointer. Only the visible, current
  // artifact may resolve it below; never fall through to an older task instead.
  if(!row||!(JSON.parse(row.data) as StoredMessage).artifacts.some(item=>item.type==='work_run'))return null;
 }
 const requestHash=hash({message,channel:options.channel??'web',receivedAt:options.receivedAt??null});
 return getDb().transaction(()=>{
  const prior=getDb().prepare('SELECT request_hash,result FROM work_conversation_commands WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? AND request_id=?').get(...owner(actor),conversationId,requestId) as {request_hash:string;result:string}|undefined;
  if(prior){if(prior.request_hash!==requestHash)throw new AppError(409,'This conversation request already represents different work.');const result=JSON.parse(prior.result) as ToolResult;assertInboxToolResultVisible(actor,result.artifacts);return result;}
  const execute=():ToolResult|null=>{
  let result:ToolResult;
  if(intent.action==='decision_help'){
   const pending=getDb().prepare('SELECT run_id FROM work_conversation_reviews WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? AND expires_at>? ORDER BY created_at DESC').all(...owner(actor),conversationId,now()) as {run_id:string}[];
   const awaiting=pending.some(row=>{const job=getWorkRun(actor,row.run_id);return job.status==='waiting_cost_approval';});
   if(!awaiting)return null;
   result=reply('A general yes or approve does not identify an exact job estimate. Use the Approve A… or Deny A… command from the intended current review, or ask to review that job again. No spending was approved.');
  }else if(intent.action==='list'){
   const runs=listWorkRuns(actor).slice(0,8);result=reply(runs.length?runs.map(run=>`${workConversationReference(run.id)} — ${run.title}: ${run.status.replaceAll('_',' ')}`).join('\n'):'You have no saved Copilot jobs yet.',runs);
  }else if(intent.action==='unsupported')result=reply('You can pause, resume or cancel a named job; for a dispositions starter, add/remove fictional research or change its selected investor. Other instruction changes require a reviewed plan revision. Nothing was changed.');
  else if(intent.action==='approve'||intent.action==='deny')result=decide(actor,intent,conversationId,requestId,options);
  else {
   const run=resolveRun(actor,intent.target,conversationId,options);
   if(!run)result=choose(actor);
   else if(intent.action==='status')result=statusResult(run);
   else if(intent.action==='review')result=reviewCost(actor,run,conversationId,requestId,options);
   else if(['add_research','remove_research','investor'].includes(intent.action))result=revise(actor,run,intent,conversationId,requestId);
   else result=statusResult(controlWorkRun(actor,run.id,{expectedVersion:run.version,eventKey:`conversation:${hash({conversationId,requestId})}`,action:intent.action as 'pause'|'resume'|'cancel'}),intent.action==='cancel'?'Canceled remaining work; completed work and consumed simulated credits stay saved.':intent.action==='pause'?'Job paused.':'Job checked and prepared to continue.');
  }
  return result;
  };
  let result:ToolResult|null;
  try{result=getDb().transaction(execute)();}
  catch(error){if(!(error instanceof AppError)||![400,402,403,404,409,422].includes(error.status))throw error;result={...reply(`${error.message} Nothing was changed by this command.`),data:{workCommand:{status:'needs_attention',code:error.status}}};}
  if(!result)return null;
  getDb().prepare('INSERT INTO work_conversation_commands VALUES(?,?,?,?,?,?,?,?)').run(...owner(actor),conversationId,requestId,requestHash,JSON.stringify(result),now());return result;
 }).immediate();
}
