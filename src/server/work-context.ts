import type {Actor,Role,ToolResult} from '../lib/contracts';
import type {WorkSourceReferences,WorkStep,WorkStepInput} from '../lib/work-contracts';
import {AppError,assertActor,getDb} from './db';
import {validateStoredWorkOutput} from './work-capabilities';
import {historyReferencesVisible} from './history';

const empty:ToolResult={specialistIds:[],message:'',artifacts:[]};
export function validateWorkSourceReferences(actor:Actor,refs?:WorkSourceReferences,sourceRole?:Role):void {
 if(sourceRole&&sourceRole!==actor.role)throw new AppError(403,'The role authorized for this original work context has changed.');
 if(refs&&!historyReferencesVisible(actor,refs))throw new AppError(403,'Access to the original context for this work has changed.');
}
export function workRunVisible(actor:Actor,id:string,planVersion?:number):boolean {
 assertActor(actor);const row=getDb().prepare('SELECT data FROM work_runs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 if(!row)return false;
 try{
  const run=JSON.parse(row.data) as {steps:WorkStep[];sourceReferences?:WorkSourceReferences;sourceRole?:Role};validateWorkSourceReferences(actor,run.sourceReferences,run.sourceRole);
  for(const step of run.steps)validateStoredWorkOutput(actor,{...step,input:step.resolvedInput??step.input},step.result??empty);
  if(planVersion!==undefined){
   const saved=getDb().prepare('SELECT data FROM work_run_plans WHERE run_id=? AND plan_version=?').get(id,planVersion) as {data:string}|undefined;if(!saved)return false;
   const plan=JSON.parse(saved.data) as {steps:WorkStepInput[];sourceReferences?:WorkSourceReferences;sourceRole?:Role};validateWorkSourceReferences(actor,plan.sourceReferences,plan.sourceRole);
   for(const step of plan.steps)validateStoredWorkOutput(actor,step,empty);
  }
  return true;
 }catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status))return false;throw error;}
}
/** Only scope/revision changes invalidate model history; ordinary progress is retrieved on demand. */
export function workContextSnapshot(actor:Actor){
 assertActor(actor);return (getDb().prepare('SELECT id,plan_version FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY id').all(actor.organizationId,actor.officeId,actor.id) as {id:string;plan_version:number}[]).map(row=>({id:row.id,planVersion:row.plan_version,visible:workRunVisible(actor,row.id)}));
}
