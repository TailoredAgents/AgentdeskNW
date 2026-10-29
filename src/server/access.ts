import { z } from 'zod';
import type { Actor, Investor, Property, Prospect } from '../lib/contracts';
import { AppError, assertActor, audit, getDb, requireRole } from './db';
import { classifyDuplicate } from './research';

export interface InvestorAccess { visibility:'owner'|'office'|'organization'|'shared'; sharedWith:string[] }
interface InvestorRow { id:string;organization_id:string;office_id:string;owner_id:string;data:string;intelligence:string|null }
export const defaultAccess:InvestorAccess={visibility:'owner',sharedWith:[]};
const policySchema=z.object({organizationVisibility:z.boolean(),crossOfficeSharing:z.boolean(),managerAssignment:z.boolean()}).strict();
export type OwnershipPolicy=z.infer<typeof policySchema>;
export function getOwnershipPolicy(actor:Actor):OwnershipPolicy {
 assertActor(actor);
 const row=getDb().prepare('SELECT settings FROM organizations WHERE id=?').get(actor.organizationId) as {settings:string};
 return policySchema.parse({...{organizationVisibility:false,crossOfficeSharing:false,managerAssignment:true},...JSON.parse(row.settings).ownershipPolicy});
}
export function updateOwnershipPolicy(actor:Actor,input:OwnershipPolicy):OwnershipPolicy {
 requireRole(actor,['manager']);const policy=policySchema.parse(input);
 const row=getDb().prepare('SELECT settings FROM organizations WHERE id=?').get(actor.organizationId) as {settings:string};
 getDb().prepare('UPDATE organizations SET settings=? WHERE id=?').run(JSON.stringify({...JSON.parse(row.settings),ownershipPolicy:policy}),actor.organizationId);
 audit(actor,'ownership.policy.updated');return policy;
}
function canRead(actor:Actor,row:InvestorRow,policy:OwnershipPolicy):boolean {
 const access:InvestorAccess=row.intelligence?{...defaultAccess,...JSON.parse(row.intelligence)}:defaultAccess;
 if(row.office_id===actor.officeId&&(row.owner_id===actor.id||actor.role==='manager'))return true;
 if(access.visibility==='organization'&&policy.organizationVisibility)return true;
 if(access.visibility==='office'&&row.office_id===actor.officeId)return true;
 return access.sharedWith.includes(actor.id)&&(row.office_id===actor.officeId||policy.crossOfficeSharing);
}
const select='SELECT i.*,x.data AS intelligence FROM investors i LEFT JOIN investor_intelligence x ON x.investor_id=i.id AND x.organization_id=i.organization_id';
export function readInvestorRow(actor:Actor,id:string):InvestorRow {
 assertActor(actor);const policy=getOwnershipPolicy(actor);
 const row=getDb().prepare(`${select} WHERE i.organization_id=? AND i.id=?`).get(actor.organizationId,z.string().min(1).max(150).parse(id)) as InvestorRow|undefined;
 if(!row||!canRead(actor,row,policy))throw new AppError(404,'The record was not found in your authorized workspace.');
 return row;
}
export function readInvestor(actor:Actor,id:string):Investor {return JSON.parse(readInvestorRow(actor,id).data) as Investor;}
export function readInvestors(actor:Actor):Investor[] {
 const policy=getOwnershipPolicy(actor);
 const rows=getDb().prepare(`${select} WHERE i.organization_id=? ORDER BY i.rowid DESC`).all(actor.organizationId) as InvestorRow[];
 return rows.filter(row=>canRead(actor,row,policy)).map(row=>JSON.parse(row.data) as Investor);
}
export function writableInvestor(actor:Actor,id:string):Investor {
 const row=readInvestorRow(actor,id);
 if(row.office_id!==actor.officeId||(row.owner_id!==actor.id&&actor.role!=='manager'))throw new AppError(403,'Shared investor access is read-only. The owner or authorized office manager must make this change.');
 return JSON.parse(row.data) as Investor;
}
/** Private records contribute only an opaque duplicate signal, never identifiers or protected details. */
export function classifyAuthorizedDuplicate(actor:Actor,prospect:Pick<Prospect,'company'|'name'>):Pick<Prospect,'duplicateStatus'|'matchedInvestorId'> {
 const visible=readInvestors(actor);const permitted=classifyDuplicate(prospect,visible);
 if(permitted.duplicateStatus!=='net_new')return permitted;
 const rows=getDb().prepare('SELECT data FROM investors WHERE organization_id=?').all(actor.organizationId) as {data:string}[];
 const privateMatch=classifyDuplicate(prospect,rows.map(row=>JSON.parse(row.data) as Investor));
 return privateMatch.duplicateStatus==='net_new'?permitted:{duplicateStatus:'possible_duplicate',matchedInvestorId:null};
}

interface PropertyAccessRow {data:string;release_owner:string|null;release_data:string|null}
function mayReadProperty(actor:Actor,row:PropertyAccessRow):boolean {
 if(!row.release_data)return true;
 const release=JSON.parse(row.release_data) as {authorizedUserIds?:string[]};
 return actor.role==='manager'||row.release_owner===actor.id||!!release.authorizedUserIds?.includes(actor.id);
}
function propertyRows(actor:Actor):PropertyAccessRow[] {
 assertActor(actor);
 const hasReleases=getDb().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='property_releases'").get();
 const sql=hasReleases?'SELECT p.data,r.owner_id AS release_owner,r.data AS release_data FROM properties p LEFT JOIN property_releases r ON r.organization_id=p.organization_id AND r.office_id=p.office_id AND r.property_id=p.id WHERE p.organization_id=? AND p.office_id=? ORDER BY p.rowid DESC':'SELECT data,NULL AS release_owner,NULL AS release_data FROM properties WHERE organization_id=? AND office_id=? ORDER BY rowid DESC';
 return getDb().prepare(sql).all(actor.organizationId,actor.officeId) as PropertyAccessRow[];
}
/** Base inventory inherits release restrictions as soon as a release exists, including draft/withdrawn versions. */
export function readProperties(actor:Actor):Property[] {return propertyRows(actor).filter(row=>mayReadProperty(actor,row)).map(row=>JSON.parse(row.data) as Property);}
export function readProperty(actor:Actor,id:string):Property {
 z.string().min(1).max(150).parse(id);
 const property=readProperties(actor).find(item=>item.id===id);
 if(!property)throw new AppError(404,'The property was not found in your authorized workspace.');
 return property;
}
