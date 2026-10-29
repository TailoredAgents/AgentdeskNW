import { demoActor } from '../src/server/db';
import { grantTrial } from '../src/server/billing';
import { specialists } from '../src/server/registry';
/** Explicit paid-capability fixtures for Phase 1/2 regression suites. No runtime bypass exists. */
export function grantLegacyTestWorkforce(){
 process.env.AGENTDESK_DEMO='true';process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO='true';
 const admin=demoActor('manager');
 for(const actor of [demoActor(),demoActor('acquisitions'),admin,{id:'user-savannah',role:'dispositions' as const}])grantTrial(admin,{userId:actor.id,features:specialists.filter(s=>s.roles.includes(actor.role)&&s.status!=='planned').map(s=>s.id),days:90,allowances:{research_credits:100,voice_minutes:60,text_tokens:100000}});
}
