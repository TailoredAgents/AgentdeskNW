import type {ToolResult} from '../lib/contracts';

const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** A model needs each fact once. Keep the complete artifact payloads, including
 * their source authority and UI metadata; omit top-level data only when one
 * artifact already contains every serialized field. Never combine partial
 * artifacts, summarize text, or alter the original service result/receipt.
 */
export function serializeModelToolResult(result:ToolResult):string {
 const original=JSON.stringify(result),value=JSON.parse(original) as ToolResult;
 if(value.data===null||typeof value.data!=='object')return original;
 const data=value.data,serialized=JSON.stringify(data);
 const redundant=value.artifacts.some(artifact=>{
  if(JSON.stringify(artifact.data)===serialized)return true;
  if(!object(data)||!object(artifact.data))return false;
  const target=artifact.data,keys=Object.keys(data);
  return keys.length>0&&keys.every(key=>Object.hasOwn(target,key)&&JSON.stringify(target[key])===JSON.stringify(data[key]));
 });
 if(!redundant)return original;
 delete value.data;
 return JSON.stringify(value);
}
