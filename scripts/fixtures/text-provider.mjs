// Explicit test-process preload only. Never installed by app/worker startup.
import {appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
if(process.env.AGENTDESK_TEXT_HTTP_ISOLATED!=='true'||!process.env.AGENTDESK_TEXT_MOCK_LOG)throw new Error('Mock text transport requires its isolated fixture.');
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.hostname!=='api.openai.com')return original(input,init);
 const request=JSON.parse(String(init?.body??'{}'));
 if(url.pathname==='/v1/responses/input_tokens'){
  appendFileSync(process.env.AGENTDESK_TEXT_MOCK_LOG,'count\n');
  return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40}));
 }
 if(url.pathname==='/v1/responses'){
  appendFileSync(process.env.AGENTDESK_TEXT_MOCK_LOG,'generation\n');
  const id=createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0,32);
  const delegate=process.env.AGENTDESK_TEXT_MOCK_DELEGATE==='true'&&!request.input.some(item=>item.type==='function_call_output'&&item.call_id==='mock-local-work');
  const output=delegate?[{type:'function_call',name:'start_work',call_id:'mock-local-work',status:'completed',arguments:JSON.stringify({title:'Prepare local buyer shortlist',steps:[{key:'property',capabilityId:'inspect_property',inputJson:JSON.stringify({propertyId:'property-maple'}),dependsOn:[]},{key:'buyers',capabilityId:'match_existing_buyers',inputJson:JSON.stringify({propertyId:'property-maple'}),dependsOn:['property']}]})}]:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Your fictional reasoning result is saved after approval.'}]}];
  return new Response(JSON.stringify({id:`mock-${id}`,model:request.model,service_tier:'default',status:'completed',output,usage:{input_tokens:20,output_tokens:10}}));
 }
 throw new Error('Unsupported OpenAI endpoint in the isolated text fixture; no network call was made.');
};
