import {afterEach,describe,expect,it,vi} from 'vitest';
import {api,ApiError} from '../src/components/ui';
import {ApiResponseError,readApiResponse} from '../src/lib/api-response';
import {parseChatRequestLookup,parseChatResponse,parseConversation} from '../src/lib/chat-response';
import type {Conversation} from '../src/lib/contracts';

afterEach(()=>vi.unstubAllGlobals());
const conversation:Conversation={id:'conversation_one',title:'Follow-up',createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z',messages:[{id:'message_one',role:'assistant',content:'Your reminder is saved.',createdAt:'2026-11-01T00:00:00.000Z',specialistIds:['copilot'],artifacts:[{type:'task',id:'task_one',title:'Follow up'}]}]};
const chatResponse=()=>({conversation:structuredClone(conversation),result:{message:'Your reminder is saved.',specialistIds:['copilot'],artifacts:[{type:'task',id:'task_one',title:'Follow up'}]}});

describe('uncertain response transport',()=>{
 it('an unreadable successful mutation remains uncertain and is never repeated',async()=>{
  const fetcher=vi.fn(async()=>new Response('<html>internal proxy detail</html>',{status:200}));vi.stubGlobal('fetch',fetcher);
  await expect(api('/chat',{message:'Save my reminder',requestId:'original'})).rejects.toSatisfy((error:unknown)=>error instanceof Error&&!(error instanceof ApiError)&&error.message.includes('saved work')&&!error.message.includes('proxy'));
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('HTTP rejections preserve decision status while unreadable error pages stay private',async()=>{
  await expect(readApiResponse(new Response(JSON.stringify({error:'This estimate changed.'}),{status:409}))).rejects.toMatchObject({status:409,message:'This estimate changed.'});
  for(const status of [401,403,429,502])await expect(readApiResponse(new Response('<html>private proxy detail</html>',{status}))).rejects.toSatisfy((error:unknown)=>error instanceof ApiResponseError&&error.status===status&&!error.message.includes('private'));
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:'This estimate changed.'}),{status:409}));
  await expect(api('/work/one/decision',{requestId:'original'})).rejects.toSatisfy((error:unknown)=>error instanceof ApiError&&error.status===409);
 });
 it('network failures use recovery copy without exposing raw details or retrying',async()=>{
  const fetcher=vi.fn(async()=>{throw new TypeError('Internal URL and diagnostic details');});vi.stubGlobal('fetch',fetcher);
  await expect(api('/chat',{message:'Save my reminder',requestId:'original'})).rejects.toSatisfy((error:unknown)=>error instanceof Error&&!(error instanceof ApiError)&&error.message.includes('saved work')&&!error.message.includes('diagnostic'));
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
});

describe('saved chat response validation',()=>{
 it('accepts renderable saved replies and current redacted history without interpreting artifacts',()=>{
  expect(parseChatResponse(chatResponse())).toEqual(chatResponse());
  const redacted=structuredClone(conversation);redacted.messages[0]={...redacted.messages[0],content:'This historical message is withheld.',artifacts:[],historyNotice:{reason:'source_unavailable',message:'The source is no longer available.'}};
  expect(parseConversation(redacted)).toEqual(redacted);
 });
 it.each([null,{},[],{conversation:{},result:{}},{conversation,result:{message:'saved'}},{...chatResponse(),conversation:{...conversation,messages:[{...conversation.messages[0],artifacts:null}]}},{...chatResponse(),conversation:{...conversation,messages:[{...conversation.messages[0],role:['assistant']}]}}])('never treats valid but wrong JSON as a completed chat response: %j',value=>{
  expect(()=>parseChatResponse(value)).toThrow('Check the saved result');
 });
 it('a valid response for a different known conversation remains uncertain',()=>{
  expect(parseChatResponse(chatResponse(),conversation.id).conversation.id).toBe(conversation.id);
  expect(()=>parseChatResponse(chatResponse(),'conversation_other')).toThrow('Check the saved result');
 });
 it('requires the checked request, known conversation and an actual saved assistant reply',()=>{
  const result={requestId:'original',status:'completed',conversation,messageId:'message_one',notice:'Saved.'};
  expect(parseChatRequestLookup(result,{requestId:'original',conversationId:conversation.id})).toEqual(result);
  for(const value of [{...result,requestId:'different'},{...result,conversation:{...conversation,id:'different'}},{...result,messageId:'missing'},{...result,conversation:{...conversation,messages:[{...conversation.messages[0],role:'user'}]}}])expect(()=>parseChatRequestLookup(value,{requestId:'original',conversationId:conversation.id})).toThrow();
 });
 it('accepts an unknown first turn without inventing a conversation, but never marks it completed',()=>{
  const result={requestId:'original',status:'not_found',conversation:null,messageId:null,notice:'No saved request.'};
  expect(parseChatRequestLookup(result,{requestId:'original'})).toEqual(result);
  expect(()=>parseChatRequestLookup(result,{requestId:'original',conversationId:conversation.id})).toThrow();
  expect(()=>parseChatRequestLookup({...result,status:'completed'},{requestId:'original'})).toThrow();
  expect(()=>parseChatRequestLookup({...result,status:'running'},{requestId:'original'})).toThrow();
  expect(()=>parseChatRequestLookup({...result,conversation,status:['running']},{requestId:'original'})).toThrow();
 });
});
