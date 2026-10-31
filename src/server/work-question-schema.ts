import {z} from 'zod';
export const workQuestionSchema=z.object({prompt:z.string().trim().min(6).max(500),answerType:z.enum(['property','investor','text','number','datetime'])}).strict();
