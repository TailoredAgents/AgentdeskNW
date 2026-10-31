import {z} from 'zod';
import {getDb,now} from './db';
import type {WorkspaceReadiness} from '../lib/connection-contracts';
export const workerLanes=['business','messaging','mobile','text'] as const;
export type WorkerLane=typeof workerLanes[number];
const laneSchema=z.enum(workerLanes);
export function recordWorkerHealth(instanceId:string,lane:WorkerLane,state:'running'|'idle'|'failed'|'stopped'){
 z.string().uuid().parse(instanceId);laneSchema.parse(lane);z.enum(['running','idle','failed','stopped']).parse(state);const time=now();
 getDb().prepare(`INSERT INTO worker_health VALUES(?,?,?,?,?,?,?) ON CONFLICT(instance_id,lane) DO UPDATE SET
 heartbeat_at=excluded.heartbeat_at,state=excluded.state,
 last_success_at=COALESCE(excluded.last_success_at,worker_health.last_success_at),
 last_failure_at=COALESCE(excluded.last_failure_at,worker_health.last_failure_at)`)
 .run(instanceId,lane,time,time,state==='idle'?time:null,state==='failed'?time:null,state);
 // Ephemeral process health has bounded retention; it contains no job or employee data.
 getDb().prepare('DELETE FROM worker_health WHERE heartbeat_at<?').run(new Date(Date.now()-7*86400000).toISOString());
}
export function workerHealth():WorkspaceReadiness['workers']{
 return workerLanes.map(lane=>{
  const row=getDb().prepare('SELECT * FROM worker_health WHERE lane=? ORDER BY started_at DESC,heartbeat_at DESC LIMIT 1').get(lane) as {heartbeat_at:string;last_success_at:string|null;state:string}|undefined;
  const state=!row?'not_seen':row.state==='stopped'||Date.now()-Date.parse(row.heartbeat_at)>30000?'stale':row.state==='failed'?'failed':row.state==='running'?'busy':'healthy';
  return {lane,state,lastSuccessAt:row?.last_success_at??null};
 });
}
