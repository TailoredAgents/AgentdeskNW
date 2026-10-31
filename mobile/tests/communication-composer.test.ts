import test from 'node:test';
import assert from 'node:assert/strict';
import {CommunicationComposer} from '../../src/lib/communication-composer';
import type {CommunicationAccount,ComposeCommunication,InboxThreadDetail} from '../../src/lib/communications-contracts';
const accounts=[{id:'company',channel:'email',access:'available',capabilities:{localDraft:true}},{id:'sms',channel:'sms',access:'available',capabilities:{localDraft:true}},{id:'revoked',access:'revoked',capabilities:{localDraft:false}}] as CommunicationAccount[];
const saved={thread:{id:'saved'}} as InboxThreadDetail;
const fields={address:'buyer@example.com',subject:'Opening message',body:'Hello'};
test('uncertain composition preserves exact request and blocks edits or closing until recovery',async()=>{
 const requests:ComposeCommunication[]=[];let attempt=0,result:InboxThreadDetail|undefined;
 const c=new CommunicationComposer(accounts,'company',async p=>{requests.push(p);if(++attempt===1)throw new Error('Connection lost');return saved;},()=>`key-${attempt}`,()=>{},v=>{result=v;});
 c.change(fields);await c.save();assert.ok(c.pending);c.change({body:'Different'});assert.equal(c.fields.body,'Hello');assert.equal(c.close(),false);await c.save();assert.equal(requests[0],requests[1]);assert.equal(result,saved);assert.equal(c.pending,null);
});
test('definitive validation failure allows a corrected request with a new identity',async()=>{
 const requests:ComposeCommunication[]=[];let seq=0;
 const c=new CommunicationComposer(accounts,'company',async p=>{requests.push(p);if(requests.length===1)throw Object.assign(new Error('Invalid address'),{status:400});return saved;},()=>`key-${++seq}`,()=>{},()=>{});
 c.change(fields);await c.save();assert.equal(c.locked,false);c.change({address:'correct@example.com'});await c.save();assert.notEqual(requests[0].eventKey,requests[1].eventKey);assert.equal(requests[1].to.address,'correct@example.com');
});
test('switching to text never silently discards email recipients or subject',async()=>{
 let calls=0;const c=new CommunicationComposer(accounts,'revoked',async()=>{calls++;return saved;},()=> 'key',()=>{},()=>{});assert.equal(c.account?.id,'company');
 c.change({...fields,cc:'attorney@example.com',accountId:'sms',address:'+14045550111'});await c.save();assert.equal(calls,0);assert.match(c.error,/Clear/);c.change({subject:'',cc:''});await c.save();assert.equal(calls,1);
});
test('discard is explicit and a late response cannot navigate a closed workspace',async()=>{
 let resolve!:(d:InboxThreadDetail)=>void,results=0;const c=new CommunicationComposer(accounts,'company',()=>new Promise(r=>{resolve=r;}),()=> 'key',()=>{},()=>{results++;});
 c.change(fields);assert.equal(c.close(),false);assert.equal(c.discardReview,true);c.stay();assert.equal(c.discardReview,false);assert.equal(c.close(),false);assert.equal(c.close(),true);
 const action=c.save();c.deactivate();resolve(saved);await action;assert.equal(results,0);
});

test('attached file identity survives uncertain retries and must be removed before switching to SMS',async()=>{
 const file={documentId:'document-one',revision:1,reference:'document-one@one'},requests:ComposeCommunication[]=[];
 const c=new CommunicationComposer(accounts,'company',async p=>{requests.push(p);if(requests.length===1)throw new Error('Connection lost');return saved;},()=> 'file-key',()=>{},()=>{});
 c.change({...fields,documents:[file]});await c.save();c.change({documents:[]});assert.deepEqual(c.fields.documents,[file]);await c.save();assert.equal(requests[0],requests[1]);assert.deepEqual(requests[1].documents,[file]);
 let sent=0;const sms=new CommunicationComposer(accounts,'sms',async()=>{sent++;return saved;},()=> 'sms-key',()=>{},()=>{});sms.change({address:'+14045550111',body:'Hello',documents:[file]});await sms.save();assert.equal(sent,0);assert.match(sms.error,/files/);sms.change({documents:[]});await sms.save();assert.equal(sent,1);
});
