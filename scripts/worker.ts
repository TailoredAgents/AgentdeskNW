import {randomUUID} from 'node:crypto';
import {recordWorkerHealth,workerLanes,type WorkerLane} from '../src/server/worker-health';
import {processStandingPermissions} from '../src/server/standing-permissions';
import {processProactiveDelivery} from '../src/server/proactive-delivery';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {processProactiveUpdates} from '../src/server/proactive';
import {processAutoTopUps} from '../src/server/auto-topup';
import {processMobileNotifications} from '../src/server/mobile-notifications';
import { processWorkRuns } from '../src/server/work-runs';
import { processMessaging } from '../src/server/messaging-worker';
import { startSlackSocket } from '../src/server/messaging-socket';
import { processQueuedJobs,processAllNotifications } from '../src/server/services';
import { processExternalResearchJobs } from '../src/server/external-research-worker';
console.info('AgentDesk worker started; pending work and employee messaging are checked every 2 seconds.');
const socket=startSlackSocket();
const instanceId=randomUUID();
const health=(lane:WorkerLane,state:'running'|'idle'|'failed'|'stopped')=>{try{recordWorkerHealth(instanceId,lane,state);}catch{console.error('worker_health_unavailable');}};
let busy=false,messagingBusy=false,mobileBusy=false,textBusy=false;
const tick=async()=>{if(busy)return;busy=true;health('business','running');try{processAutoTopUps();processStandingPermissions();processQueuedJobs();processWorkRuns(undefined,5);processAllNotifications();processProactiveUpdates();await processExternalResearchJobs();health('business','idle');}catch(error){health('business','failed');console.error('worker_tick_failed',error instanceof Error?error.name:'UnknownError');}finally{busy=false;}};
// External research can take minutes. It must not block the employee's next message.
const messagingTick=async()=>{if(messagingBusy)return;messagingBusy=true;health('messaging','running');try{await processMessaging();health('messaging','idle');}catch{health('messaging','failed');console.error('messaging_tick_failed');}finally{messagingBusy=false;}};
const mobileTick=async()=>{if(mobileBusy)return;mobileBusy=true;health('mobile','running');try{await processMobileNotifications();await processProactiveDelivery();health('mobile','idle');}catch{health('mobile','failed');console.error('mobile_notification_tick_failed');}finally{mobileBusy=false;}};
const textTick=async()=>{if(textBusy)return;textBusy=true;health('text','running');try{await processApprovedTextRequests();health('text','idle');}catch{health('text','failed');console.error('text_continuation_tick_failed');}finally{textBusy=false;}};
void tick();void messagingTick();void mobileTick();void textTick();
const timer=setInterval(()=>void tick(),2000),messagingTimer=setInterval(()=>void messagingTick(),2000),mobileTimer=setInterval(()=>void mobileTick(),3000),textTimer=setInterval(()=>void textTick(),2000);
const heartbeat=setInterval(()=>{for(const [lane,active] of [['business',busy],['messaging',messagingBusy],['mobile',mobileBusy],['text',textBusy]] as const)if(active)health(lane,'running');},10000);
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 if(stopping)return;stopping=true;[timer,messagingTimer,mobileTimer,textTimer,heartbeat].forEach(clearInterval);
 // Finish current local transactions/receipts when possible; uncertain in-flight operations retain their claims.
 void (async()=>{const deadline=Date.now()+6000;while((busy||messagingBusy||mobileBusy||textBusy)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  workerLanes.forEach(lane=>health(lane,'stopped'));await Promise.race([socket?.disconnect()??Promise.resolve(),new Promise(resolve=>setTimeout(resolve,250))]);process.exit(0);
 })();
});
