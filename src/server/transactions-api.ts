import {NextRequest,NextResponse} from 'next/server';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {getTransactions,getTransaction,saveTransaction,transactionSaveSchema} from './transactions';
export async function transactionsRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='transactions')return;
 const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method==='GET'&&path.length===1)return json(getTransactions(actor));
 if(request.method==='GET'&&path.length===2)return json(getTransaction(actor,path[1]));
 if(request.method==='POST'&&path.length===2&&path[1]==='save')return json(saveTransaction(actor,transactionSaveSchema.parse(await body())));
 throw new AppError(404,'This transaction action is unavailable.');
}
