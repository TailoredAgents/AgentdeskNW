import { processQueuedJobs,processAllNotifications } from '../src/server/services';
import { processExternalResearchJobs } from '../src/server/external-research-worker';
console.info('AgentDesk local worker started; pending jobs and reminders are checked every 2 seconds.');
let busy=false;
const tick=async()=>{if(busy)return;busy=true;try{processQueuedJobs();processAllNotifications();await processExternalResearchJobs();}catch(error){console.error('worker_tick_failed',error instanceof Error ? error.name:'UnknownError');}finally{busy=false;}};
void tick();
const timer=setInterval(()=>void tick(),2000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);process.exit(0);});
