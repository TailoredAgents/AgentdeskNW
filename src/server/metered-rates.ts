import {z} from 'zod';
import type {MeteredRate} from '../lib/metered-work-contracts';
import {AppError} from './db';
import {fingerprint} from './provider-runtime';

const fixtures:MeteredRate[]=[
 {id:'test-voice-v1',provider:'test-double',model:'fictional-voice',basis:'test_fixture',customerMicrosPerUnit:{audio_input_units:100,audio_output_units:200},source:'AgentDesk authored audio usage fixture; not a voice provider tariff'},
 {id:'test-text-v1',provider:'test-double',model:'fictional-text',basis:'test_fixture',customerMicrosPerUnit:{input_tokens:10,cached_input_tokens:2,output_tokens:50},source:'AgentDesk authored test fixture; not OpenAI pricing'},
 {id:'test-search-v1',provider:'test-double',model:'fictional-search',basis:'test_fixture',customerMicrosPerUnit:{search_calls:500000},source:'AgentDesk authored test fixture; not a research provider price'},
];
const nano=z.number().int().min(0).max(1_000_000_000);
const tariff=z.object({
 model:z.string().trim().min(1).max(150).regex(/^[a-zA-Z0-9_.:-]+$/),serviceTier:z.literal('default'),
 source:z.string().trim().min(8).max(500),validFrom:z.string().datetime({offset:true}),validUntil:z.string().datetime({offset:true}),
 customerNanosPerUnit:z.object({input_tokens:nano.positive(),cached_input_tokens:nano,output_tokens:nano.positive()}).strict(),
}).strict();

/** Operator-owned customer credit tariffs. Never provider invoice prices or a network switch.
 * One nanodollar per token equals $0.001 per million tokens. All multiplication stays integer.
 */
function configured():MeteredRate[]{
 const raw=process.env.AGENTDESK_TEXT_CUSTOMER_TARIFFS;
 if(!raw)return [];
 try{
  if(raw.length>32000)throw new Error('too_large');
  const values=z.array(tariff).max(20).parse(JSON.parse(raw));
  for(const value of values){
   if(Date.parse(value.validUntil)<=Date.parse(value.validFrom)||value.customerNanosPerUnit.cached_input_tokens>value.customerNanosPerUnit.input_tokens)throw new Error('invalid_interval_or_cache');
  }
  for(let i=0;i<values.length;i++)for(let j=0;j<i;j++){
   const a=values[i],b=values[j];
   if(a.model===b.model&&a.serviceTier===b.serviceTier&&Date.parse(a.validFrom)<Date.parse(b.validUntil)&&Date.parse(b.validFrom)<Date.parse(a.validUntil))throw new Error('overlapping_tariffs');
  }
  return values.map(value=>({...value,id:`customer-text-${fingerprint(value)}`,provider:'openai',basis:'configured_customer_tariff',customerMicrosPerUnit:Object.fromEntries(Object.entries(value.customerNanosPerUnit).map(([unit,n])=>[unit,n/1000]))}));
 }catch{throw new AppError(503,'The configured customer text tariff is invalid. Paid admission is unavailable; ask the operator to review the rate configuration.');}
}
function active(rate:MeteredRate){return !rate.validFrom||!rate.validUntil||Date.parse(rate.validFrom)<=Date.now()&&Date.now()<Date.parse(rate.validUntil);}
export function meteredRate(id:string):MeteredRate {
 const fixture=fixtures.find(rate=>rate.id===id);if(fixture)return structuredClone(fixture);
 const rate=[...configured(),...configuredResearch()].find(rate=>rate.id===id&&active(rate));
 if(!rate)throw new AppError(409,'No supported current versioned rate is available. Paid dispatch is unavailable.');
 return structuredClone(rate);
}
/** Called only by a trusted host with its configured response model, not a model-selected price. */
export function customerTextTariff(model:string):MeteredRate {
 const rate=configured().find(rate=>rate.model===model&&active(rate));
 if(!rate)throw new AppError(503,'No current customer credit tariff is configured for this text model. Paid admission is unavailable.');
 return structuredClone(rate);
}
export function assertMeteredRateCurrent(snapshot:MeteredRate){
 if(fingerprint(meteredRate(snapshot.id))!==fingerprint(snapshot))throw new AppError(409,'The assignment tariff changed. Review a new whole-assignment quote before continuing.');
}

const researchTariff=tariff.extend({customerNanosPerUnit:z.object({input_tokens:nano.positive(),cached_input_tokens:nano,output_tokens:nano.positive(),web_search_calls:nano.positive()}).strict()});
function configuredResearch():MeteredRate[]{
 const raw=process.env.AGENTDESK_RESEARCH_CUSTOMER_TARIFF;if(!raw)return [];
 try{if(raw.length>4000)throw new Error('too large');const value=researchTariff.parse(JSON.parse(raw));
  if(Date.parse(value.validUntil)<=Date.parse(value.validFrom)||value.customerNanosPerUnit.cached_input_tokens>value.customerNanosPerUnit.input_tokens)throw new Error('invalid tariff');
  return [{...value,id:`customer-research-${fingerprint(value)}`,provider:'openai',basis:'configured_customer_tariff',customerMicrosPerUnit:Object.fromEntries(Object.entries(value.customerNanosPerUnit).map(([k,v])=>[k,v/1000]))}];
 }catch{throw new AppError(503,'The configured customer research tariff is invalid.');}
}
export function customerResearchTariff(model:string){const value=configuredResearch().find(rate=>rate.model===model&&active(rate));if(!value)throw new AppError(503,'No current customer research tariff is configured.');return structuredClone(value);}
