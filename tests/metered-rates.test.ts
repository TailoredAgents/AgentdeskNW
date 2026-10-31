import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor} from '../src/server/db';
import {fingerprint} from '../src/server/provider-runtime';
import {customerTextTariff,meteredRate} from '../src/server/metered-rates';
import {quoteMeteredAssignment,admitMeteredAttempt,recordMeteredReceipt,getMeteredAssignment,finishMeteredAssignment} from '../src/server/metered-work';
import type {MeteredPart,UsageUnits} from '../src/lib/metered-work-contracts';

const tariff={model:'example-text-model',serviceTier:'default',source:'Fictional operator retail-credit policy v1; no provider price claim',validFrom:'2026-10-01T00:00:00Z',validUntil:'2026-11-01T00:00:00Z',customerNanosPerUnit:{input_tokens:25,cached_input_tokens:5,output_tokens:125}};
let sequence=0;const key=()=>`tariff-${++sequence}`,actor=()=>demoActor(),scope=fingerprint('fictional scope');
const configure=(values:unknown=[tariff])=>vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS',JSON.stringify(values));
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));configure();sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();});
const part=(maximumUnits:UsageUnits,overrides:Partial<MeteredPart>={}):MeteredPart=>({key:'planning',feature:'core',rateId:customerTextTariff(tariff.model).id,maximumCalls:10,maximumUnits,estimatedUnits:maximumUnits,...overrides});
const create=(parts:MeteredPart[])=>quoteMeteredAssignment(actor(),{assignmentKey:key(),title:'Fictional configured tariff assignment',scopeHash:scope,revision:1,parts});
function admit(assignment:ReturnType<typeof create>,bounds:UsageUnits,partKey='planning',attemptId=key()){return admitMeteredAttempt(actor(),{assignmentId:assignment.id,revision:assignment.revision,scopeHash:scope,attemptId,partKey,requestHash:fingerprint({attemptId}),bounds});}
function receipt(assignment:ReturnType<typeof create>,attemptId:string,usage:UsageUnits){return recordMeteredReceipt(actor(),{assignmentId:assignment.id,attemptId,status:'succeeded',responseId:key(),usage,providerCostMicros:null});}

describe('operator-owned versioned customer tariffs in the simulated ledger',()=>{
 it('derives immutable identities from complete configuration without claiming provider prices',()=>{
  const rate=customerTextTariff(tariff.model);expect(rate.id).toMatch(/^customer-text-[a-f0-9]{64}$/);expect(rate).toMatchObject({basis:'configured_customer_tariff',provider:'openai',serviceTier:'default',customerMicrosPerUnit:{input_tokens:0.025,cached_input_tokens:0.005,output_tokens:0.125}});
  configure([{...tariff,source:'Fictional revised credit policy v2'}]);expect(customerTextTariff(tariff.model).id).not.toBe(rate.id);expect(()=>meteredRate(rate.id)).toThrow('current versioned rate');
 });
 it('has no implicit production rate or fallback to the fictional fixture',()=>{
  vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS','');expect(()=>customerTextTariff(tariff.model)).toThrow('No current');expect(()=>meteredRate('gpt-6-astra')).toThrow('rate');expect(meteredRate('test-text-v1').basis).toBe('test_fixture');
 });
 it.each([
  {...tariff,validUntil:tariff.validFrom},
  {...tariff,serviceTier:'priority'},
  {...tariff,customerNanosPerUnit:{...tariff.customerNanosPerUnit,cached_input_tokens:26}},
  {...tariff,customerNanosPerUnit:{...tariff.customerNanosPerUnit,output_tokens:-1}},
  {...tariff,customerNanosPerUnit:{...tariff.customerNanosPerUnit,output_tokens:0.1}},
  {...tariff,customerNanosPerUnit:{...tariff.customerNanosPerUnit,audio_tokens:1}},
  {...tariff,providerCostCents:0},
 ])('rejects incomplete or incompatible operator configuration without echoing it: %j',value=>{
  configure([value]);expect(()=>customerTextTariff(tariff.model)).toThrow('configuration');
  try{customerTextTariff(tariff.model);}catch(error){expect((error as Error).message).not.toContain(value.source);}
 });
 it('rejects overlapping versions and chooses the next version only at its effective boundary',()=>{
  const next={...tariff,validFrom:tariff.validUntil,validUntil:'2026-12-01T00:00:00Z',source:'Fictional operator policy v2'};
  configure([tariff,{...next,validFrom:'2026-10-31T00:00:00Z'}]);expect(()=>customerTextTariff(tariff.model)).toThrow('configuration');
  configure([tariff,next]);const before=customerTextTariff(tariff.model);vi.setSystemTime(new Date(tariff.validUntil));const after=customerTextTariff(tariff.model);expect(after.id).not.toBe(before.id);expect(after.source).toBe(next.source);
 });
 it.each([99,100,101])('computes the whole %i cent threshold with exact fractional-micro prices',cents=>{
  const assignment=create([part({input_tokens:cents*400000})]);expect(assignment.budget.maximumCents).toBe(cents);expect(assignment.budget.status).toBe(cents>100?'awaiting_approval':'approved');
  if(cents>100)expect(()=>admit(assignment,{input_tokens:1})).toThrow('approve');
 });
 it('accumulates tiny receipts in integer nanodollars and rounds the assignment only once to cents',()=>{
  const assignment=create([part({output_tokens:80000})]);
  for(let index=0;index<10;index++){const claim=admit(assignment,{output_tokens:8000});receipt(assignment,claim.attempt.id,{output_tokens:8000});}
  const result=finishMeteredAssignment(actor(),assignment.id,'completed');expect(result.customerMicros).toBe(10000);expect(result.budget.spentCents).toBe(1);expect(result.providerCostMicros).toBeNull();
 });
 it('records fractional micro-dollar evidence without rounding each subcall',()=>{
  const assignment=create([part({input_tokens:10})]);
  for(let index=0;index<10;index++){const claim=admit(assignment,{input_tokens:1});receipt(assignment,claim.attempt.id,{input_tokens:1});}
  const result=getMeteredAssignment(actor(),assignment.id);expect(result.customerMicros).toBe(0.25);expect(result.attempts.every(attempt=>attempt.customerMicros===0.025)).toBe(true);expect(result.budget.spentCents).toBe(1);
 });
 it.each(['expiry','withdrawal','malformed_configuration'])('blocks new dispatch after %s but settles original admitted work at its original price',cause=>{
  const assignment=create([part({output_tokens:80000})]),claim=admit(assignment,{output_tokens:8000});
  if(cause==='expiry')vi.setSystemTime(new Date(tariff.validUntil));else if(cause==='withdrawal')configure([]);else vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS','invalid');
  expect(()=>admit(assignment,{output_tokens:8000})).toThrow();
  const settled=receipt(assignment,claim.attempt.id,{output_tokens:8000});expect(settled.customerMicros).toBe(1000);expect(settled.attempts[0].rate.id).toBe(assignment.parts[0].rateId);
  expect(admitMeteredAttempt(actor(),{assignmentId:assignment.id,revision:1,scopeHash:scope,attemptId:claim.attempt.id,partKey:'planning',requestHash:claim.attempt.requestHash,bounds:claim.attempt.bounds}).dispatch).toBe(false);
  expect(finishMeteredAssignment(actor(),assignment.id,'completed').budget.reservedCents).toBe(0);
 });
 it('preserves old consumed parts through a tariff revision and requests approval for the aggregate new total',()=>{
  const oldPart=part({input_tokens:39_600_000},{maximumCalls:1}),assignment=create([oldPart]),claim=admit(assignment,oldPart.maximumUnits);receipt(assignment,claim.attempt.id,oldPart.maximumUnits);
  configure([{...tariff,source:'Fictional revised credit policy v2'}]);
  const additional=part({input_tokens:800000},{key:'follow_up',parentKey:'planning',maximumCalls:1});
  const revised=quoteMeteredAssignment(actor(),{assignmentKey:assignment.assignmentKey,title:assignment.title,scopeHash:scope,revision:2,parts:[oldPart,additional]});
  expect(revised.budget).toMatchObject({spentCents:99,maximumCents:101,status:'awaiting_approval'});expect(revised.rates).toHaveLength(2);expect(()=>admit(revised,additional.maximumUnits,'follow_up')).toThrow('approve');
  expect(()=>quoteMeteredAssignment(actor(),{assignmentKey:assignment.assignmentKey,title:assignment.title,scopeHash:scope,revision:3,parts:[{...oldPart,maximumCalls:2},additional]})).toThrow('current versioned rate');
 });
 it('rejects tariffs for an unpriced unit and oversized multiplication before a hold exists',()=>{
  expect(()=>create([part({audio_tokens:1})])).toThrow('unpriced');
  configure([{...tariff,customerNanosPerUnit:{input_tokens:1_000_000_000,cached_input_tokens:0,output_tokens:1_000_000_000}}]);
  expect(()=>create([part({output_tokens:1_000_000_000})])).toThrow('too large');
 });
});
