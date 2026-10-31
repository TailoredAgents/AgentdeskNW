import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyOpportunity,opportunityForm,parseOpportunityForm,type Opportunity} from '../../src/lib/opportunity-contracts';
test('phone opportunity revision sends supplied fields, preserving unknowns and excluding record authority',()=>{
 const record:Opportunity={...structuredClone(emptyOpportunity),id:'opportunity-fixture',ownerId:'not-a-client-field',version:3,createdAt:'2026-10-30T12:00:00Z',updatedAt:'2026-10-30T12:00:00Z',synthetic:true,address:'416 Fictional Road',city:'Marietta',state:'GA',submission:{...emptyOpportunity.submission,wholesaler:'Demo source',sourceReference:'Demo email',repairEstimate:0}};
 const form=opportunityForm(record),value=parseOpportunityForm({...form,state:' ga '});assert.equal(value.state,'GA');assert.equal(value.closingTarget,null);assert.equal(value.submission.askingPrice,null);assert.equal(value.submission.repairEstimate,0);assert.equal('id' in value,false);assert.equal('ownerId' in value,false);assert.equal('version' in value,false);
});
test('phone opportunity amount errors stay correctable instead of silently changing values',()=>{
 const form=opportunityForm();for(const askingPrice of ['200,000','$200000','-20','20xyz'])assert.throws(()=>parseOpportunityForm({...form,submission:{...form.submission,askingPrice}}));
});
