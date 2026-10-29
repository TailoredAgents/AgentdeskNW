import { createHash } from 'node:crypto';
import type { Actor } from '@/lib/contracts';
import { getDb } from './db';
import { getOwnershipPolicy, readInvestorRow } from './access';
import { getDisclosurePolicy, getInvestorIntelligence, isDisclosureReady } from './intelligence';
import { listReleases, listTemplates } from './workflows';
import { listInvestors, listProperties } from './services';

/** Fingerprints only protected state; routine task/job updates must not interrupt speech. */
export function voiceContextSnapshot(actor:Actor):Record<string,string> {
  const result:Record<string,string>={};
  const add=(key:string,value:unknown)=>{result[key]=createHash('sha256').update(JSON.stringify(value)).digest('hex');};
  add('scope',{organization:actor.organizationId,office:actor.officeId,user:actor.id,role:actor.role,ownership:getOwnershipPolicy(actor),disclosure:getDisclosurePolicy(actor)});
  const releases=listReleases(actor);
  for(const investor of listInvestors(actor)) {
    const row=readInvestorRow(actor,investor.id),profile=getInvestorIntelligence(actor,investor.id);
    add(`investor:${investor.id}`,{office:row.office_id,owner:row.owner_id,visibility:profile.visibility,sharedWith:profile.sharedWith,buyBoxes:profile.buyBoxes,disclosure:profile.disclosure,disclosureReady:isDisclosureReady(profile.disclosure)});
  }
  for(const property of listProperties(actor)) {
    const row=getDb().prepare('SELECT owner_id FROM properties WHERE organization_id=? AND office_id=? AND id=?').get(actor.organizationId,actor.officeId,property.id);
    const release=releases.find(item=>item.propertyId===property.id);
    add(`property:${property.id}`,{property,owner:row,release:release?{id:release.id,version:release.version,status:release.status}:null});
  }
  for(const release of releases){const {matches,...protectedRelease}=release;void matches;const owner=getDb().prepare('SELECT owner_id FROM property_releases WHERE organization_id=? AND office_id=? AND id=?').get(actor.organizationId,actor.officeId,release.id);add(`release:${release.id}`,{...protectedRelease,owner});}
  for(const template of listTemplates(actor))add(`template:${template.id}`,template);
  const packages=getDb().prepare('SELECT id,data FROM deal_packages WHERE organization_id=? AND office_id=? AND owner_id=?').all(actor.organizationId,actor.officeId,actor.id) as {id:string;data:string}[];
  for(const row of packages){const value=JSON.parse(row.data) as {status:string};if(value.status!=='blocked')add(`package:${row.id}`,value);}
  return result;
}
