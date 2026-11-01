import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {AppError} from './db';

function key(){const raw=process.env.AGENTDESK_CREDENTIAL_KEY??'';const value=Buffer.from(raw,'base64');if(value.length!==32||value.toString('base64')!==raw)throw new AppError(503,'Configure a 32-byte base64 credential encryption key.');return value;}
/** Purpose/identity are authenticated so ciphertext cannot move between employees or providers. */
export function sealCredential(value:unknown,purpose:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(purpose));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,encrypted,cipher.getAuthTag()].map(v=>v.toString('base64url')).join('.');}
export function openCredential<T>(value:string,purpose:string):T{try{const parts=value.split('.');if(parts.length!==3)throw new Error();const [iv,data,tag]=parts.map(v=>Buffer.from(v,'base64url'));const decipher=createDecipheriv('aes-256-gcm',key(),iv);decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString()) as T;}catch(error){if(error instanceof AppError)throw error;throw new AppError(409,'The saved credential cannot be opened for this identity.');}}
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');

/** Bound all remote identity/token documents. Never include provider bodies in errors. */
export async function boundedProviderJson(response:Response,maximum=100_000):Promise<unknown>{
 if(!response.ok||!response.body||Number(response.headers.get('content-length')??0)>maximum)throw new AppError(502,'The provider did not return an acceptable response.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maximum)throw new AppError(502,'The provider response exceeded its limit.');chunks.push(chunk.value);}return JSON.parse(Buffer.concat(chunks).toString());}
 catch{await reader.cancel().catch(()=>{});throw new AppError(502,'The provider response could not be validated.');}
 finally{reader.releaseLock();}
}
