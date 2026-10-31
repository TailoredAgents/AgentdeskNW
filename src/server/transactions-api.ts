import {getTransactionTeams,getTransactionTeam,transactionTeamSetup,reviewTransactionTeam,publishTransactionTeam,mutateTransactionTeam,transactionTeamPublishSchema,transactionTeamCommitSchema,transactionTeamActionSchema} from './transaction-team';
import {transactionEmailAccounts,prepareTransactionEmail,prepareTransactionEmailSchema} from './transaction-correspondence';
import {NextRequest,NextResponse} from 'next/server';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {getTransactions,getTransaction,saveTransaction,transactionSaveSchema} from './transactions';
export async function transactionsRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='transactions')return;
 const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(path[1]==='team'){
  if(request.method==='GET'&&path.length===2)return json(getTransactionTeams(actor));
  if(request.method==='POST'&&path.length===3&&path[2]==='review')return json(reviewTransactionTeam(actor,transactionTeamPublishSchema.parse(await body())));
  if(request.method==='POST'&&path.length===3&&path[2]==='publish')return json(publishTransactionTeam(actor,transactionTeamCommitSchema.parse(await body())));
  if(request.method==='GET'&&path.length===3)return json(getTransactionTeam(actor,path[2]));
  if(request.method==='POST'&&path.length===3)return json(mutateTransactionTeam(actor,path[2],transactionTeamActionSchema.parse(await body())));
  throw new AppError(404,'This team coordination action is unavailable.');
 }
 if(request.method==='GET'&&path.length===3&&path[2]==='team')return json(transactionTeamSetup(actor,path[1]));
 if(request.method==='GET'&&path.length===1)return json(getTransactions(actor));
 if(request.method==='GET'&&path.length===3&&path[2]==='email')return json(transactionEmailAccounts(actor,path[1]));
 if(request.method==='POST'&&path.length===3&&path[2]==='email')return json(prepareTransactionEmail(actor,path[1],prepareTransactionEmailSchema.parse(await body())));
 if(request.method==='GET'&&path.length===2)return json(getTransaction(actor,path[1]));
 if(request.method==='POST'&&path.length===2&&path[1]==='save')return json(saveTransaction(actor,transactionSaveSchema.parse(await body())));
 throw new AppError(404,'This transaction action is unavailable.');
}
