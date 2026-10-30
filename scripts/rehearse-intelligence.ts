import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Explicit opt-in: two live AI turns, at most six provider requests, fictional records only.
if (!process.argv.includes('--live')) throw new Error('Use --live to run the bounded provider rehearsal. This makes billable AI requests.');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.OPENAI_API_KEY) throw new Error('A configured OpenAI key is required.');
const directory = mkdtempSync(join(tmpdir(), 'agentdesk-intelligence-live-'));
Object.assign(process.env, {AGENTDESK_DB_PATH:join(directory,'rehearsal.sqlite'), AGENTDESK_DEMO:'true', AGENTDESK_ALLOW_PRODUCTION_DEMO:'true', AGENTDESK_CHANNELS_ENABLED:'false', AGENTDESK_CHANNEL_SEND_ENABLED:'false', AGENTDESK_TEXT_MAX_ROUNDS:'3', AGENTDESK_TEXT_MAX_TOOL_CALLS:'3', AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'3000', AGENTDESK_TEXT_TIMEOUT_MS:'60000', OPENAI_REASONING_EFFORT:'low'});
const {closeDb,demoActor,getDb} = await import('../src/server/db');
const {prepareDemoScenario} = await import('../src/server/demo-scenario');
const {chat} = await import('../src/server/orchestrator');
const {getEmployeeMemory} = await import('../src/server/memory');
const {providerOperations} = await import('../src/server/provider-runtime');
const {getInvestorJourney} = await import('../src/server/journey');
const report:Record<string,unknown> = {createdAt:new Date().toISOString(), description:'Two-turn functional rehearsal with changed stored context; this is not a generic-AI benchmark.', synthetic:true};
try {
  prepareDemoScenario();
  const actor = demoActor();
  const before = await chat(actor,'What should I do next with Mike Bennett? Explain the reason and give me a relationship-only message draft.',undefined,'rehearsal-before');
  report.before = before.result;
  console.log('First live turn saved.');
  await chat(actor,'Remember an objection for Mike: He passed on a prior opportunity because the repair scope and costs were unclear.',before.conversation.id,'rehearsal-objection');
  await chat(actor,'Remember: keep my messages short and direct. Avoid salesy language.',before.conversation.id,'rehearsal-correction');
  const after = await chat(actor,'What should I do next with Mike Bennett now? Explain the reason and give me a relationship-only message draft.',before.conversation.id,'rehearsal-after');
  report.after = after.result;
  report.memory = getEmployeeMemory(actor);
  report.concerns = getInvestorJourney(actor,'investor-mike').openIssues;
  const db=getDb();
  report.specialistCalls=db.prepare('SELECT name,COUNT(*) calls FROM (SELECT json_extract(result,\'$.specialistIds[0]\') name FROM assistant_tool_receipts) GROUP BY name').all();
  report.receipts=providerOperations(actor).map(({operationId,model,status,usage,errorCode})=>({operationId,model,status,usage,errorCode}));
  report.completed = providerOperations(actor).length>=2 && providerOperations(actor).every(item=>item.status==='succeeded') && ![before.result.message,after.result.message].some(value=>/connection failed|step limit/i.test(value));
  if(!report.completed)process.exitCode=1;
} finally {
  mkdirSync('artifacts/intelligence',{recursive:true});
  writeFileSync('artifacts/intelligence/live-rehearsal.json', JSON.stringify(report,null,2));
  closeDb();rmSync(directory,{recursive:true,force:true});
  console.log('Rehearsal saved to artifacts/intelligence/live-rehearsal.json. Review its answers and provider receipts before making quality claims.');
}
