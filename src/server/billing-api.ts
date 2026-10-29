import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import * as billing from './billing';
import { grantCredits,simulateUsage,usageBalances } from './metering';
export function getBillingState(actor:Actor){return {...billing.billingBaseState(actor),usage:usageBalances(actor)};}
export async function billingRoute(request:NextRequest,actor:Actor,path:string[],readBody:()=>Promise<unknown>){
 if(path[0]!=='billing')return undefined;const operation=path[1],method=request.method;const json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(!operation&&method==='GET')return json(getBillingState(actor));
 if(operation==='quote'&&method==='POST')return json(billing.quoteSubscription(actor,billing.selectionSchema.parse(await readBody())));
 if(operation==='subscription'&&method==='POST')return json(billing.changeSubscription(actor,await readBody() as Parameters<typeof billing.changeSubscription>[1]));
 if(operation==='lifecycle'&&method==='POST')return json(billing.simulateLifecycle(actor,await readBody() as Parameters<typeof billing.simulateLifecycle>[1]));
 if(operation==='admin'&&method==='GET')return json(billing.adminBillingState(actor));
 if(operation==='policy'&&method==='POST')return json(billing.saveBillingPolicy(actor,await readBody()));
 if(operation==='trial'&&method==='POST')return json(billing.grantTrial(actor,await readBody() as Parameters<typeof billing.grantTrial>[1]));
 if(operation==='credits'&&method==='POST')return json(grantCredits(actor,await readBody() as Parameters<typeof grantCredits>[1]));
 if(operation==='simulate-usage'&&method==='POST')return json(simulateUsage(actor,await readBody() as Parameters<typeof simulateUsage>[1]));
 if(operation==='price'&&method==='POST')return json(billing.updatePrice(actor,await readBody() as Parameters<typeof billing.updatePrice>[1]));
 throw new z.ZodError([{code:'custom',path:[],message:'Unknown billing operation.'}]);
}
