import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,createApi,normalizeOrigin,RequestIdentity,SessionEpoch,workIdFromUrl} from '../src/client';

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
