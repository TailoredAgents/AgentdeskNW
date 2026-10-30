import { processWorkRuns } from '../src/server/work-runs';
import { processMessaging } from '../src/server/messaging-worker';
import { startSlackSocket } from '../src/server/messaging-socket';
import { processQueuedJobs,processAllNotifications } from '../src/server/services';
import { processExternalResearchJobs } from '../src/server/external-research-worker';
console.info('AgentDesk worker started; pending work and employee messaging are checked every 2 seconds.');
const socket=startSlackSocket();
let busy=false,messagingBusy=false;
const tick=async()=>{if(busy)return;busy=true;try{processQueuedJobs();processWorkRuns(undefined,5);processAllNotifications();await processExternalResearchJobs();}catch(error){console.error('worker_tick_failed',error instanceof Error?error.name:'UnknownError');}finally{busy=false;}};
// External research can take minutes. It must not block the employee's next message.
const messagingTick=async()=>{if(messagingBusy)return;messagingBusy=true;try{await processMessaging();}catch{console.error('messaging_tick_failed');}finally{messagingBusy=false;}};
void tick();void messagingTick();
const timer=setInterval(()=>void tick(),2000),messagingTimer=setInterval(()=>void messagingTick(),2000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);clearInterval(messagingTimer);void (socket?.disconnect()??Promise.resolve()).finally(()=>process.exit(0));});
