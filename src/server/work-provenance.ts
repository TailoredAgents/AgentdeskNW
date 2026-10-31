import type {Actor,Artifact,ToolResult} from '../lib/contracts';
import type {WorkSourceReferences} from '../lib/work-contracts';
import {getDb} from './db';
import {collectHistoryReferences,historyReferencesVisible,type HistoryReferences,type StoredMessage} from './history';
import {getConversation,listInvestors,listProperties} from './services';

const keys=['investors','properties','releases','packages','debriefs','inboxThreads','inboxAccess','handoffAccess','workQuestions','opportunityAccess','analysisAccess'] as const;
/** Bind model-authored prose to the authorized context it could have used. Never trust caller-supplied provenance. */
export function deriveWorkSourceReferences(actor:Actor,conversationId:string,requestId:string):WorkSourceReferences {
 getConversation(actor,conversationId);const db=getDb(),scope=[actor.organizationId,actor.officeId,actor.id];
 // A duplicate start must retain the original provenance as well as the original request hash.
 const existing=db.prepare('SELECT data FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=? AND request_id=?').get(...scope,requestId) as {data:string}|undefined;
 if(existing){const saved=JSON.parse(existing.data) as {sourceReferences:WorkSourceReferences};if(saved.sourceReferences)return saved.sourceReferences;}
 const messages=(db.prepare('SELECT data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=? ORDER BY sequence DESC LIMIT 24').all(conversationId,...scope) as {data:string}[]).map(row=>JSON.parse(row.data) as StoredMessage);
 const inherited=messages.flatMap(message=>message.references?[message.references]:[]);
 const receipts=db.prepare('SELECT result FROM assistant_tool_receipts WHERE conversation_id=? AND organization_id=? AND office_id=? AND user_id=?').all(conversationId,...scope) as {result:string}[];
 const artifacts:Artifact[]=[];
 for(const row of receipts){
  const result=JSON.parse(row.result) as ToolResult;
  const structured=[...result.artifacts,{type:'notes' as const,title:'Stored tool context',data:result.data}];
  if(historyReferencesVisible(actor,collectHistoryReferences(actor,structured)))artifacts.push(...structured);
 }
 const references=collectHistoryReferences(actor,artifacts,inherited,{investors:listInvestors(actor),properties:listProperties(actor)});
 const refs:WorkSourceReferences={investors:[],properties:[],releases:[],packages:[],debriefs:[],inboxThreads:[],inboxAccess:[],handoffAccess:[],workQuestions:[],opportunityAccess:[],analysisAccess:[]};
 const seen=new Set<string>();
 const flatten=(value:HistoryReferences)=>{
  for(const key of keys)(refs[key]??=[]).push(...(value[key]??[]));
  // Flatten prior work into record references. Stored provenance never links back to another job.
  for(const reference of value.workRuns??[]){
   if(seen.has(reference))continue;seen.add(reference);const [runId,version]=reference.split('@');
   const row=db.prepare('SELECT data,plan_version FROM work_runs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(runId,...scope) as {data:string;plan_version:number}|undefined;if(!row)continue;
   const run=JSON.parse(row.data) as {sourceReferences?:WorkSourceReferences;steps:unknown[]};
   if(run.sourceReferences)for(const key of keys)(refs[key]??=[]).push(...(run.sourceReferences[key]??[]));
   const plan=db.prepare('SELECT data FROM work_run_plans WHERE run_id=? AND plan_version=?').get(runId,version?Number(version):row.plan_version) as {data:string}|undefined;
   flatten(collectHistoryReferences(actor,[{type:'notes',title:'Prior work sources',data:{steps:run.steps,plan:plan?JSON.parse(plan.data):null}}]));
  }
 };
 flatten(references);for(const key of keys)refs[key]=[...new Set(refs[key]??[])].sort();return refs;
}
