import {describe,expect,it} from 'vitest';
import type {Artifact} from '../src/lib/contracts';
import {partitionConversationArtifacts} from '../src/lib/conversation-presentation';

describe('conversation resource presentation',()=>{
 it('keeps spending, approval, saved work and private preparations outside collapsed evidence',()=>{
  const actions:Artifact[]=[{type:'approval',id:'approval_1',title:'Review change'},{type:'work_run',title:'Review saved assignment spending'},{type:'work_run',id:'work_1',title:'Saved job'},{type:'task',id:'task_1',title:'Saved reminder'},{type:'inbox',id:'thread_1',title:'Review draft'},{type:'handoff',title:'Review proposed assignment',data:{preparationId:'prep_1'}},{type:'opportunity',title:'Review proposed intake',data:{preparationId:'prep_2'}}];
  const result=partitionConversationArtifacts([...actions,{type:'investors',id:'investor_1',title:'Investor context'},{type:'analysis',id:'analysis_1',title:'Scenario evidence'}]);
  expect(result.primary).toEqual(actions);expect(result.supporting).toHaveLength(2);
 });
 it('keeps a sole reference immediately available, including a generic manager board',()=>{
  const board:Artifact={type:'handoff',title:'Review shared handoffs'};
  expect(partitionConversationArtifacts([board])).toEqual({primary:[board],supporting:[]});
 });
 it('removes exact duplicate links without merging different source revisions or actions',()=>{
  const old:Artifact={type:'document',id:'doc_1',title:'Read document',data:{revision:1}};
  const current:Artifact={...old,data:{revision:2}};
  expect(partitionConversationArtifacts([old,{...old},current])).toEqual({primary:[],supporting:[old,current]});
 });
 it('does not invent a workspace destination for guidance validity metadata',()=>{
  expect(partitionConversationArtifacts([{type:'guidance',title:'Current method reference',data:{method:'example'}}])).toEqual({primary:[],supporting:[]});
 });
});
