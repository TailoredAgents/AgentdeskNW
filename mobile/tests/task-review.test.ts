import test from 'node:test';
import assert from 'node:assert/strict';
import type {Task} from '../../src/lib/contracts';
import {localDeadline,sortTasks,taskReviewCurrent} from '../src/task-review';
import {parseSubmissionForm,submissionForm} from '../../src/lib/acquisition-contracts';
const task:Task={id:'task-one',ownerId:'employee',title:'Review the repair source',dueAt:null,status:'open',version:1,investorId:null,createdAt:'2026-10-30T10:00:00Z'};
test('task review rejects another version, owner, status or changed text',()=>{const review={task,change:{action:'complete' as const},eventKey:'one'};assert.equal(taskReviewCurrent(review,{...task}),true);for(const changed of [{version:2},{ownerId:'other'},{status:'completed' as const},{title:'Different task'},{dueAt:'2030-01-01T00:00:00Z'}])assert.equal(taskReviewCurrent(review,{...task,...changed}),false);assert.equal(taskReviewCurrent(review,null),false);});
test('custom reminders reject rollover dates, malformed or past times',()=>{for(const [date,time] of [['2030-02-30','09:00'],['2030-01-01','25:00'],['2030-1-1','09:00'],['2000-01-01','09:00']])assert.throws(()=>localDeadline(date,time));const result=new Date(localDeadline('2030-01-02','09:35'));assert.equal(result.getHours(),9);assert.equal(result.getMinutes(),35);assert.equal(result.getDate(),2);});
test('follow-ups sort open due work before undated work and history',()=>{assert.deepEqual(sortTasks([{...task,id:'closed',status:'completed'},{...task,id:'undated'},{...task,id:'later',dueAt:'2030-01-02T12:00:00Z'},{...task,id:'earlier',dueAt:'2030-01-01T12:00:00Z'}]).map(t=>t.id),['earlier','later','undated','closed']);});
test('submission entry keeps unknown amounts null and rejects ambiguous numeric text',()=>{const form=submissionForm(null);assert.equal(parseSubmissionForm(form).askingPrice,null);assert.throws(()=>parseSubmissionForm({...form,askingPrice:'$100,000'}));assert.throws(()=>parseSubmissionForm({...form,repairEstimate:'30k'}));assert.equal(parseSubmissionForm({...form,askingPrice:'100000.50'}).askingPrice,100000.5);});

import {handoffFormMutation,handoffReviewCurrent} from '../../src/lib/handoff-contracts';
import type {HandoffItem} from '../../src/lib/handoff-contracts';
test('handoff reviews bind source and follow-up versions and require current action authority',()=>{
 const item={releaseStatus:'released',releaseVersion:2,record:{version:3},actions:['acknowledge']} as HandoffItem;
 const input={action:'acknowledge',eventKey:'one',expectedVersion:3,expectedReleaseVersion:2} as const;
 assert.equal(handoffReviewCurrent(item,input),true);assert.equal(handoffReviewCurrent({...item,releaseVersion:3},input),false);assert.equal(handoffReviewCurrent({...item,actions:[]},input),false);assert.equal(handoffReviewCurrent({...item,releaseStatus:'withdrawn'},input),false);
});
test('reported outcomes require an evidence reference and an explicit reviewed version',()=>{
 const item={releaseVersion:2,record:{version:3}} as HandoffItem;
 const form={action:'report',assignedTo:'',nextAction:'',date:'',time:'',kind:'resolved',note:'Access was clarified.',evidence:'Fictional operational source #17'} as const;
 assert.deepEqual(handoffFormMutation(item,form,'same'),{action:'report',kind:'resolved',note:form.note,evidence:form.evidence,eventKey:'same',expectedReleaseVersion:2,expectedVersion:3});
 assert.throws(()=>handoffFormMutation(item,{...form,evidence:''},'same'));
});

import {isRolePreparationArtifact} from '../../src/lib/role-preparation-contracts';
test('prepared actions open their decision surface instead of the underlying record editor',()=>{for(const type of ['opportunity','handoff'] as const){assert.equal(isRolePreparationArtifact({type,id:'source',title:'Review',data:{preparationId:'prepared'}}),true);assert.equal(isRolePreparationArtifact({type,id:'source',title:'Record'}),false);}assert.equal(isRolePreparationArtifact({type:'inbox',title:'Mail',data:{preparationId:'prepared'}}),false);});
