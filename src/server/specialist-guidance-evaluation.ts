import {AsyncLocalStorage} from 'node:async_hooks';
import type {Actor} from '../lib/contracts';
import {AppError,assertActor} from './db';

export type SpecialistGuidanceEvaluationMode='included'|'omitted';
interface EvaluationIdentity {version:1;mode:SpecialistGuidanceEvaluationMode}
interface EvaluationScope {owner:string;identity:Readonly<EvaluationIdentity>}
const evaluationContext=new AsyncLocalStorage<EvaluationScope>();
const ownerKey=(actor:Actor)=>JSON.stringify([actor.organizationId,actor.officeId,actor.id,actor.role,actor.name]);

/** Trusted operator evaluation only: no route, model argument, or environment switch.
 * This varies the catalog prompt, never service guidance, permissions, or tools.
 * Explicit arms have separate request/scope identities even when guidance is included.
 */
export function withSpecialistGuidanceEvaluation<T>(actor:Actor,mode:SpecialistGuidanceEvaluationMode,work:()=>T):T {
 assertActor(actor);
 if(mode!=='included'&&mode!=='omitted')throw new AppError(400,'Unknown specialist guidance evaluation mode.');
 const owner=ownerKey(actor),parent=evaluationContext.getStore();
 if(parent&&parent.owner!==owner)throw new AppError(403,'A specialist guidance evaluation cannot change employee identity.');
 return evaluationContext.run({owner,identity:Object.freeze({version:1,mode})},work);
}

/** Undefined preserves ordinary request bytes and fingerprints. */
export function specialistGuidanceEvaluation(actor:Actor):Readonly<EvaluationIdentity>|undefined {
 const scope=evaluationContext.getStore();
 if(!scope)return undefined;
 assertActor(actor);
 if(scope.owner!==ownerKey(actor))throw new AppError(403,'A specialist guidance evaluation cannot change employee identity.');
 return scope.identity;
}
