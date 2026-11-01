import type { ProviderStatus } from '../lib/provider-contracts';
import type { Actor } from '../lib/contracts';
import { assertActor } from './db';
import { providerOperations } from './provider-runtime';
import { textProviderConfig } from './provider-config';
import { researchConfig } from './external-research-provider';

export function providerStatus(actor:Actor):ProviderStatus{
 assertActor(actor);const operations=providerOperations(actor),text=textProviderConfig(),research=researchConfig();
 const entry=(kind:string,configured:boolean,model:string)=>{const recent=operations.filter(op=>op.kind===kind&&op.model===model);const successful=recent.find(op=>op.status==='succeeded');return {configured,model,lastSuccessAt:successful?.updatedAt??null,lastResponseId:successful?.providerResponseId??null,state:!configured?'setup_required':successful?'receipt_recorded':'configured_unverified'};};
 return {text:entry('text_response',!!process.env.OPENAI_API_KEY,text.model),voice:entry('voice_response',!!process.env.OPENAI_API_KEY,process.env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1'),research:entry('research',research.selected&&research.configured&&research.estimatedRequestCents>0,research.model),
  limits:{textRounds:text.maxRounds,textToolCalls:text.maxToolCalls,textOutputTokens:text.maxOutputTokens,researchRequests:research.maxCalls,researchSearchCalls:research.maxSearchCalls,researchEstimateCapCents:research.maxCostCents},
  sources:{crm:'Local demonstration records; no production Salesforce connection',webResearch:'OpenAI public web search; source claims and business contacts are unverified',propertyTransactions:'Disconnected; licensed transaction verification is not implemented',outreach:'Disconnected; no investor messages or calls are sent'},
  usage:{operations:operations.length,unresolved:operations.filter(o=>o.status==='started'||o.status==='unknown').length,knownCostOperations:operations.filter(o=>o.actualCostCents!==null).length,knownCostCents:operations.reduce((sum,o)=>sum+(o.actualCostCents??0),0),tokens:operations.reduce((sum,o)=>sum+(o.usage.input_tokens??0)+(o.usage.output_tokens??0),0)},
  receipts:operations.map(({operationId,provider,kind,model,status,usage,actualCostCents,estimatedCostCents,providerResponseId,createdAt,errorCode})=>({operationId,provider,kind,model,status,usage,actualCostCents,estimatedCostCents,providerResponseId,createdAt,errorCode}))};
}
