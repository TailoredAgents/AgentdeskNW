import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {defaultEvaluationRoot,evaluationPolicy,inspectEvaluation,prepareEvaluation,runEvaluation,type EvaluationTransport} from '../evaluations/specialists/runner';

// Unlike specialist-benchmark.ts this operator-only command can make paid requests,
// but only `run` with an exact frozen-plan approval. It never opens app persistence.
const [command,name,...args]=process.argv.slice(2);
const root=defaultEvaluationRoot();
const usage='Use prepare <new-run-name>, inspect <run-name>, or run <run-name> --approve-plan <hash> --maximum-cents <whole-run-cap> [--through-sample 1|2].';
function options(){
 const allowed=new Set(['--approve-plan','--maximum-cents','--through-sample']),values=new Map<string,string>();
 if(args.length%2)throw new Error(usage);
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||values.has(args[i]))throw new Error(usage);values.set(args[i],args[i+1]);}
 const planHash=values.get('--approve-plan')??'',maximumCents=Number(values.get('--maximum-cents')),sample=values.get('--through-sample');
 if(!/^[a-f0-9]{64}$/.test(planHash)||!Number.isSafeInteger(maximumCents)||maximumCents<1||sample!==undefined&&!['1','2'].includes(sample))throw new Error(usage);
 return {planHash,maximumCents,...(sample?{throughSample:Number(sample) as 1|2}:{})};
}
async function main(){
 if(!name)throw new Error(usage);
 if(command==='prepare'&&!args.length){const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();return prepareEvaluation(root,name,revision);}
 if(command==='inspect'&&!args.length)return inspectEvaluation(root,name);
 if(command!=='run')throw new Error(usage);
 const approval=options();
 // Load the existing server-side credential without printing it or copying it to evidence.
 if(existsSync('.env.local'))process.loadEnvFile('.env.local');
 if(!process.env.OPENAI_API_KEY?.trim())throw new Error('The existing OpenAI server credential is not configured. No provider call was made.');
 const request=async(path:'responses'|'responses/input_tokens',body:string,clientRequestId?:string)=>{
  const response=await fetch(`https://api.openai.com/v1/${path}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json',...(clientRequestId?{'X-Client-Request-Id':clientRequestId}:{})},body,signal:AbortSignal.timeout(evaluationPolicy.requestTimeoutMs)});
  return {status:response.status,body:await response.text(),requestId:response.headers.get('x-request-id')??undefined};
 };
 const transport:EvaluationTransport={count:body=>request('responses/input_tokens',body),create:(body,id)=>request('responses',body,id)};
 return runEvaluation(root,name,approval,transport);
}
try{console.info(JSON.stringify(await main(),null,2));}catch(error){
 // Never print exception objects, provider response bodies or request headers.
 const message=error instanceof Error?error.message:'The evaluation stopped; inspect its saved evidence.';
 console.error(message.includes('sk-')?'The evaluation stopped; inspect its saved status.':message);
 process.exitCode=1;
}
