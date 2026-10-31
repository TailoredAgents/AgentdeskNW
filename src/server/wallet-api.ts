import {getAutoTopUpState,previewAutoTopUp,saveAutoTopUp,checkAutoTopUp,resolveAutoTopUp} from './auto-topup';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {estimateWalletWork,getWalletState,resolveWalletWork,simulateWalletWork,topUpWallet,updateWalletSettings} from './wallet';

export async function walletRoute(request:NextRequest,actor:Actor,path:string[],readBody:()=>Promise<unknown>){
 if(path[0]!=='wallet')return undefined;
 const operation=path[1],method=request.method,json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&method==='GET')return json(getWalletState(actor));
 if(operation==='auto-topup'&&path.length===2&&method==='GET')return json(getAutoTopUpState(actor));
 if(path.length!==2||method!=='POST')throw new z.ZodError([{code:'custom',path:[],message:'Unknown wallet operation.'}]);
 const input=await readBody();
 if(operation==='auto-topup-preview')return json(previewAutoTopUp(actor,input as Parameters<typeof previewAutoTopUp>[1]));
 if(operation==='auto-topup')return json(saveAutoTopUp(actor,input as Parameters<typeof saveAutoTopUp>[1]));
 if(operation==='auto-topup-check'){z.object({}).strict().parse(input);return json(checkAutoTopUp(actor));}
 if(operation==='auto-topup-resolve')return json(resolveAutoTopUp(actor,input as Parameters<typeof resolveAutoTopUp>[1]));
 if(operation==='topup')return json(topUpWallet(actor,input as Parameters<typeof topUpWallet>[1]));
 if(operation==='settings')return json(updateWalletSettings(actor,input as Parameters<typeof updateWalletSettings>[1]));
 if(operation==='estimate')return json(estimateWalletWork(actor,input as Parameters<typeof estimateWalletWork>[1]));
 if(operation==='simulate')return json(simulateWalletWork(actor,input as Parameters<typeof simulateWalletWork>[1]));
 if(operation==='resolve')return json(resolveWalletWork(actor,input as Parameters<typeof resolveWalletWork>[1]));
 throw new z.ZodError([{code:'custom',path:[],message:'Unknown wallet operation.'}]);
}
