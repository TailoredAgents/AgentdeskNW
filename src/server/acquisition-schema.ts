import {z} from 'zod';
const text=z.string().trim().max(2000),amount=z.number().finite().nonnegative().max(1e9).nullable();
export const acquisitionSubmissionSchema=z.object({
 wholesaler:z.string().trim().min(1).max(300),sourceReference:z.string().trim().min(1).max(500),
 reportedOn:z.iso.date().nullable().refine(value=>!value||value<=new Date().toISOString().slice(0,10),'The source date cannot be in the future.'),
 askingPrice:amount,repairEstimate:amount,repairScope:text,repairSource:text,occupancy:z.enum(['unknown','vacant','occupied']),comparableSources:text,
}).strict();
