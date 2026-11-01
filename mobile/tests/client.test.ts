import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,createApi,normalizeOrigin,RequestIdentity,SessionEpoch,workIdFromUrl,updateIdFromUrl} from '../src/client';
import {parseChatResponse,parseChatRequestLookup} from '../../src/lib/chat-response';

test('workspace address permits HTTPS and rejects embedded credential/path tricks',()=>{
 assert.equal(normalizeOrigin(' https://agent.example.com/ '),'https://agent.example.com');
 for(const input of ['https://user:secret@example.com','https://example.com/path','https://example.com/?token=x','https://example.com/#work','javascript:alert(1)','file:///tmp/a','http://example.com'])assert.throws(()=>normalizeOrigin(input));
});
test('HTTP is only available for explicit local development',()=>{
 for(const input of ['http://127.0.0.1:3000','http://10.0.2.2:3000','http://192.168.1.2:3000','http://[::1]:3000']){assert.throws(()=>normalizeOrigin(input));assert.equal(normalizeOrigin(input,true),input);}
 for(const input of ['http://evil.example','http://192.168.1.2.evil.example','http://172.32.1.2','http://999.1.2.3'])assert.throws(()=>normalizeOrigin(input,true));
});
test('authenticated requests never follow redirects or use browser cookies',async()=>{
 let calls=0;const api=createApi('https://workspace.example','test-device-token',async(url,init)=>{calls++;assert.equal(url,'https://workspace.example/api/chat');assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-device-token');assert.deepEqual(JSON.parse(init?.body as string),{message:'Hello',requestId:'stable'});return new Response(JSON.stringify({ok:true}),{status:200});});
 assert.deepEqual(await api('/chat',{message:'Hello',requestId:'stable'}),{ok:true});assert.equal(calls,1);
});
test('untrusted endpoint cannot send credentials to another server',async()=>{
 let calls=0;const api=createApi('https://workspace.example','token',async()=>{calls++;return new Response('{}');});
 for(const path of ['https://elsewhere.example','//elsewhere.example','/../private','/work\\elsewhere','/work#fragment'])await assert.rejects(api(path));assert.equal(calls,0);
});
test('server errors preserve status without automatically repeating a mutation',async()=>{
 let calls=0;const api=createApi('https://workspace.example','token',async()=>{calls++;return new Response(JSON.stringify({error:'This estimate changed.'}),{status:409});});
 await assert.rejects(api('/work/work_demo/decision',{quoteId:'old'}),error=>error instanceof ApiError&&error.status===409&&error.message==='This estimate changed.');assert.equal(calls,1);
});
test('unreadable server responses produce a bounded error',async()=>{
 const api=createApi('https://workspace.example','token',async()=>new Response('<private html>',{status:502}));await assert.rejects(api('/work'),error=>error instanceof ApiError&&error.status===502&&!error.message.includes('private html'));
});
test('an unreadable successful save retains its original identity without an automatic retry',async()=>{
 let calls=0;const identity=new RequestIdentity(()=> 'original-request'),signature='saved job',requestId=identity.for(signature);
 const api=createApi('https://workspace.example','token',async()=>{calls++;return new Response('<private html>',{status:200});});
 await assert.rejects(api('/work',{requestId}).then(result=>{identity.complete(requestId);return result;}),error=>error instanceof Error&&!(error instanceof ApiError)&&!error.message.includes('private html'));
 assert.equal(calls,1);assert.equal(identity.outstanding,true);assert.equal(identity.for(signature),requestId);assert.throws(()=>identity.for('different job'));
});
test('a network failure stays uncertain and does not expose transport details or repeat work',async()=>{
 let calls=0;const api=createApi('https://workspace.example','token',async()=>{calls++;throw new TypeError('Failed with private transport details');});
 await assert.rejects(api('/chat',{message:'Save a reminder',requestId:'original'}),error=>error instanceof ApiError&&error.status===0&&error.message.includes('Check your connection')&&!error.message.includes('private transport'));
 assert.equal(calls,1);
});
test('malformed chat success and unrelated saved-result checks cannot clear the pending request',async()=>{
 const identity=new RequestIdentity(()=> 'original-request'),requestId=identity.for('original message');
 const conversation={id:'conversation-original',title:'Agent',createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',messages:[]};
 const api=createApi('https://workspace.example','token',async()=>new Response(JSON.stringify({conversation,result:{}}),{status:200}));
 await assert.rejects(api<unknown>('/chat',{requestId,message:'original message'}).then(value=>{const answer=parseChatResponse(value);identity.complete(requestId);return answer;}));
 for(const value of [
  {requestId:'another-request',status:'not_found',conversation,messageId:null,notice:'Not found'},
  {requestId,status:'not_found',conversation:{...conversation,id:'another-conversation'},messageId:null,notice:'Not found'},
  {requestId,status:'completed',conversation,messageId:'missing-answer',notice:'Completed'},
 ])assert.throws(()=>{parseChatRequestLookup(value,{requestId,conversationId:conversation.id});identity.complete(requestId);});
 assert.equal(identity.id,requestId);assert.equal(identity.outstanding,true);
});
test('uncertain retries retain their identity and cannot silently become different work',()=>{
 let count=0;const identity=new RequestIdentity(()=>`request-${++count}`);assert.equal(identity.for('first'),'request-1');assert.equal(identity.for('first'),'request-1');assert.throws(()=>identity.for('second'));identity.complete('other');assert.equal(identity.outstanding,true);identity.complete('request-1');assert.equal(identity.for('second'),'request-2');identity.clear();assert.equal(identity.outstanding,false);
});
test('late private responses are ignored after account or app-state changes',()=>{
 const epoch=new SessionEpoch(),initial=epoch.capture();assert.equal(epoch.matches(initial),true);epoch.next();assert.equal(epoch.matches(initial),false);const current=epoch.capture();epoch.next();assert.equal(epoch.matches(current),false);
});
test('notification links accept only exact app work links',()=>{
 assert.equal(workIdFromUrl('agentdesknw://work/work_demo-123'),'work_demo-123');
 for(const value of ['https://evil.example/work/work_demo','agentdesknw://settings/work_demo','agentdesknw://work/work_demo?token=secret','agentdesknw://work/work_demo#fragment','agentdesknw://work/..%2Fprivate','agentdesknw://work/work_demo/extra'])assert.equal(workIdFromUrl(value),null);
});
test('inbox status changes use PATCH with the same authenticated transport',async()=>{
 const api=createApi('https://workspace.example','test-device-token',async(_url,init)=>{assert.equal(init?.method,'PATCH');assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');assert.deepEqual(JSON.parse(init?.body as string),{status:'done',expectedVersion:3,eventKey:'one'});return new Response('{}');});
 await api('/inbox/inbox_thread_one',{status:'done',expectedVersion:3,eventKey:'one'},'PATCH');
});

test('update links accept only the exact native route and safe identifier',()=>{assert.equal(updateIdFromUrl('agentdesknw://updates/update_demo-123'),'update_demo-123');for(const url of ['https://updates/update_demo','agentdesknw://updates/update_demo?token=x','agentdesknw://updates/update_demo#fragment','agentdesknw://user@updates/update_demo','agentdesknw://updates/work_demo','agentdesknw://updates/update_a/extra','agentdesknw://updates/%2e%2e','agentdesknw://updates:80/update_demo'])assert.equal(updateIdFromUrl(url),null);});
