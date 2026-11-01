import { z } from 'zod';

function bounded(name:string,fallback:number,min:number,max:number){
 const value=process.env[name];
 return z.number().int().min(min).max(max).parse(value?Number(value):fallback);
}
export function textProviderConfig(){
 return {model:process.env.OPENAI_MODEL||'gpt-6.1-sol',reasoning:z.enum(['low','medium','high','xhigh','max']).parse(process.env.OPENAI_REASONING_EFFORT||'high'),
  spendingMode:z.enum(['operational','admitted_demo']).parse(process.env.AGENTDESK_TEXT_SPENDING_MODE||'operational'),
  maxInputTokens:bounded('AGENTDESK_TEXT_MAX_INPUT_TOKENS',20000,512,300000),
  maxRounds:bounded('AGENTDESK_TEXT_MAX_ROUNDS',5,1,8),maxToolCalls:bounded('AGENTDESK_TEXT_MAX_TOOL_CALLS',8,1,16),
  maxOutputTokens:bounded('AGENTDESK_TEXT_MAX_OUTPUT_TOKENS',8000,512,16000),requestTimeoutMs:bounded('AGENTDESK_TEXT_TIMEOUT_MS',90000,1000,120000),
  maxContextBytes:bounded('AGENTDESK_TEXT_MAX_CONTEXT_BYTES',180000,10000,300000)};
}
