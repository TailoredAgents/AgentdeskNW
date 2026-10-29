import { AppError } from './db';
export interface BillingProvider {id:string;configured:boolean;collectPayment(input:{customerRef:string;amountCents:number;idempotencyKey:string}):Promise<{status:string;providerRef:string|null}>}
export class LocalBillingProvider implements BillingProvider {id='local_simulator';configured=true;async collectPayment(){return {status:'simulated_paid',providerRef:null};}}
/** No checkout, credentials, card storage, webhook ingress or real charges are enabled. */
export class StripeBillingProvider implements BillingProvider {id='stripe';configured=false;async collectPayment():Promise<never>{throw new AppError(503,'Stripe is disconnected. An authorized, signature-verified provider adapter is required before payment collection.');}}
export function assertBillingDemo(){if(process.env.AGENTDESK_DEMO!=='true'||process.env.NODE_ENV==='production'&&process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO!=='true')throw new AppError(403,'Billing simulation is enabled only in the explicitly configured local demo.');}
