import type {Actor,Role} from '../lib/contracts';
import type {PropertyRelease} from '../lib/intelligence-contracts';
import type {Opportunity} from '../lib/opportunity-contracts';
import {AppError,getDb} from './db';
import {getOpportunity,getOpportunityBoard} from './opportunities';

export interface HandoffSource {
 id:string;owner_id:string;kind:'release'|'opportunity';
 value:{version:number;status:'draft'|'released'|'withdrawn'|'reviewing'|'not_pursuing';source:string;authorizedUserIds:string[];closingAt:string|null;releasedAt:string|null;downstreamStage:string;upstreamStage?:string;property:{address:string}};
}
function release(row:{id:string;owner_id:string;data:string}):HandoffSource{return {...row,kind:'release',value:JSON.parse(row.data) as PropertyRelease};}
function opportunity(value:Opportunity):HandoffSource{return {id:value.id,owner_id:value.ownerId,kind:'opportunity',value:{version:value.version,status:value.status,source:`Employee-supplied wholesaler: ${value.submission.wholesaler} · ${value.submission.sourceReference}`,authorizedUserIds:[],closingAt:value.closingTarget,releasedAt:null,downstreamStage:'Pre-inventory review · not a released property',property:{address:value.address}}};}
export function handoffSource(actor:Actor,id:string):HandoffSource {
 const row=getDb().prepare('SELECT id,owner_id,data FROM property_releases WHERE id=? AND organization_id=? AND office_id=?').get(id,actor.organizationId,actor.officeId) as {id:string;owner_id:string;data:string}|undefined;
 if(row)return release(row);
 try{return opportunity(getOpportunity(actor,id).opportunity);}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))throw new AppError(404,'This handoff is not available in your workspace.');throw error;}
}
export function handoffSources(actor:Actor):HandoffSource[]{
 const values=(getDb().prepare('SELECT id,owner_id,data FROM property_releases WHERE organization_id=? AND office_id=? ORDER BY id').all(actor.organizationId,actor.officeId) as {id:string;owner_id:string;data:string}[]).map(release);
 if((['acquisitions','manager'] as Role[]).includes(actor.role))try{values.push(...getOpportunityBoard(actor).items.map(opportunity));}catch(error){if(!(error instanceof AppError&&error.status===403))throw error;}
 return values;
}
export function handoffTables(source:HandoffSource){return source.kind==='opportunity'?{coordination:'opportunity_handoff_coordination',events:'opportunity_handoff_events'}:{coordination:'handoff_coordination',events:'handoff_events'};}
