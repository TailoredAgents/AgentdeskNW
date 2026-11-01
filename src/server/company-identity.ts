import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,assertMembership,getDb,now,newId} from './db';
import {actorForMember} from './services';

const identity=z.object({issuer:z.string().url().max(500).refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}),subject:z.string().min(1).max(240)}).strict();
// Provisioning/revocation is an offline operator boundary. It must still work after
// the employee loses sign-in authority; no employee or model route calls these mutations.
function identityAudit(actor:Actor,event:string,metadata:Record<string,unknown>={}){assertMembership(actor);getDb().prepare('INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?)').run(newId('audit'),actor.organizationId,actor.officeId,actor.id,event,actor.id,JSON.stringify({...metadata,boundary:'trusted_identity_operator'}),now());}
/** Preprovisioning by a trusted company-identity adapter/operator only. There is no HTTP enrollment route. */
export function bindCompanyIdentity(actor:Actor,raw:z.input<typeof identity>){
 assertMembership(actor);const input=identity.parse(raw);
 return getDb().transaction(()=>{
  const prior=getDb().prepare('SELECT * FROM company_identity_bindings WHERE issuer=? AND subject=?').get(input.issuer,input.subject) as {organization_id:string;office_id:string;user_id:string;role:string;revoked_at:string|null}|undefined;
  if(prior){if(prior.organization_id!==actor.organizationId||prior.office_id!==actor.officeId||prior.user_id!==actor.id||prior.role!==actor.role||prior.revoked_at)throw new AppError(409,'This identity already has a different or revoked membership binding.');return;}
  getDb().prepare('INSERT INTO company_identity_bindings VALUES(?,?,?,?,?,?,1,NULL)').run(input.issuer,input.subject,actor.organizationId,actor.officeId,actor.id,actor.role);
  identityAudit(actor,'identity.preprovisioned',{issuer:input.issuer});
 }).immediate();
}
/** Only call AFTER an approved identity adapter has verified issuer, signature, audience,
 * nonce, expiry and login transaction. This resolver is not an OIDC/JWT verifier or login endpoint. */
export function resolveVerifiedCompanySubject(raw:z.input<typeof identity>,expectedVersion?:number):{actor:Actor;bindingVersion:number}{
 const input=identity.parse(raw);
 const row=getDb().prepare('SELECT * FROM company_identity_bindings WHERE issuer=? AND subject=?').get(input.issuer,input.subject) as {organization_id:string;office_id:string;user_id:string;role:string;version:number;revoked_at:string|null}|undefined;
 if(!row||row.revoked_at||expectedVersion!==undefined&&row.version!==expectedVersion)throw new AppError(403,'This company identity has no current workspace membership.');
 const actor=actorForMember(row.organization_id,row.office_id,row.user_id);
 if(actor.role!==row.role)throw new AppError(403,'Company membership changed; provision a current identity binding.');
 return {actor,bindingVersion:row.version};
}
export function revokeCompanyIdentity(actor:Actor,raw:z.input<typeof identity>){
 assertMembership(actor);const input=identity.parse(raw);
 return getDb().transaction(()=>{
  const row=getDb().prepare('SELECT revoked_at FROM company_identity_bindings WHERE issuer=? AND subject=? AND organization_id=? AND office_id=? AND user_id=?').get(input.issuer,input.subject,actor.organizationId,actor.officeId,actor.id) as {revoked_at:string|null}|undefined;
  if(!row)throw new AppError(404,'Company identity binding not found.');if(row.revoked_at)return;
  identityAudit(actor,'identity.revoked');
  getDb().prepare("UPDATE oauth_grants SET status='revoked',secret='',updated_at=? WHERE connection_id IN (SELECT id FROM capability_connections WHERE organization_id=? AND office_id=? AND user_id=?)").run(now(),actor.organizationId,actor.officeId,actor.id);
  getDb().prepare("UPDATE oauth_transactions SET status='failed',secret='' WHERE connection_id IN (SELECT id FROM capability_connections WHERE organization_id=? AND office_id=? AND user_id=?) AND status IN ('pending','claimed')").run(actor.organizationId,actor.officeId,actor.id);
  getDb().prepare('UPDATE company_identity_bindings SET revoked_at=?,version=version+1 WHERE issuer=? AND subject=?').run(now(),input.issuer,input.subject);
  getDb().prepare('UPDATE company_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE issuer=? AND subject=?').run(now(),input.issuer,input.subject);
  getDb().prepare('UPDATE mobile_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE organization_id=? AND office_id=? AND user_id=?').run(now(),actor.organizationId,actor.officeId,actor.id);
  getDb().prepare('UPDATE mobile_pairings SET consumed_at=COALESCE(consumed_at,?) WHERE organization_id=? AND office_id=? AND user_id=?').run(now(),actor.organizationId,actor.officeId,actor.id);
  getDb().prepare('UPDATE messaging_links SET active=0,updated_at=? WHERE organization_id=? AND office_id=? AND user_id=?').run(now(),actor.organizationId,actor.officeId,actor.id);
 }).immediate();
}

/** Explicit operator review after a role change or rehire; never inferred from an ID token. */
export function refreshCompanyIdentityBinding(actor:Actor,raw:z.input<typeof identity>&{expectedVersion:number}){
 assertMembership(actor);const {expectedVersion,...source}=z.object({issuer:identity.shape.issuer,subject:identity.shape.subject,expectedVersion:z.number().int().positive()}).strict().parse(raw),input=identity.parse(source);
 return getDb().transaction(()=>{
  const prior=getDb().prepare('SELECT role,version,revoked_at FROM company_identity_bindings WHERE issuer=? AND subject=? AND organization_id=? AND office_id=? AND user_id=?').get(input.issuer,input.subject,actor.organizationId,actor.officeId,actor.id) as {role:string;version:number;revoked_at:string|null}|undefined;
  if(!prior||prior.version!==expectedVersion)throw new AppError(409,'Review the current company membership binding before reprovisioning.');
  // Revoke all old authority, including connections, before issuing the new version.
  if(!prior.revoked_at)revokeCompanyIdentity(actor,input);
  const version=prior.version+(prior.revoked_at?1:2);
  getDb().prepare('UPDATE company_identity_bindings SET role=?,version=?,revoked_at=NULL WHERE issuer=? AND subject=?').run(actor.role,version,input.issuer,input.subject);
  identityAudit(actor,'identity.reprovisioned',{previousRole:prior.role,role:actor.role,version});return {version};
 }).immediate();
}
