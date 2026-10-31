import {z} from 'zod';
import {AppError} from './db';
import {textReceiptUnits} from './metered-work';

const receipt=z.object({
 id:z.string().min(1).max(150),model:z.string().min(1).max(150),
 service_tier:z.string().min(1).max(80),
 status:z.enum(['completed','incomplete','failed','canceled','cancelled']),usage:z.unknown(),
}).passthrough();

/** Trusted Responses envelope, before using any output or executing its tools.
 * Queued/in-progress responses and mismatched processing identities cannot settle a final charge.
 */
export function responsesReceipt(raw:unknown,expected:{model:string;serviceTier:string}) {
 const parsed=receipt.safeParse(raw);
 if(!parsed.success)throw new AppError(502,'The model usage receipt could not be confirmed. The reservation remains held, and no output or tools from this response will be used.');
 const value=parsed.data;
 if(value.model!==expected.model||value.service_tier!==expected.serviceTier)throw new AppError(502,'The model or processing tier differed from the admitted request. Usage needs reconciliation before continuing.');
 let units;
 try{units=textReceiptUnits(value.usage);}catch{throw new AppError(502,'The model usage receipt could not be confirmed. The reservation remains held, and no output or tools from this response will be used.');}
 return {id:value.id,status:value.status==='cancelled'?'canceled' as const:value.status,units,raw:value};
}
