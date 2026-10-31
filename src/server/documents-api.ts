import {previewDocumentImport,discardDocumentImport} from './document-imports';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {readDocumentOriginal,documentSaveSchema,documentWithdrawSchema,getDocument,getDocuments,readDocumentRevision,saveDocument,withdrawDocument} from './documents';
export async function documentsRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='documents')return;
 const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method==='GET'){
  if(path.length===1)return json(getDocuments(actor));
  if(path.length===2)return json(getDocument(actor,path[1]));
  if(path.length===3&&path[2]==='revision')return json(readDocumentRevision(actor,path[1],z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get('revision'))));
  if(path.length===3&&path[2]==='original'){
   const number=z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get('revision')),value=readDocumentOriginal(actor,path[1],number);
   return new NextResponse(new Uint8Array(value.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="original-r${number}.pdf"; filename*=UTF-8''${encodeURIComponent(value.preview.original.fileName).replaceAll("'",'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
  }
  if(path.length===3&&path[2]==='download'){
   const detail=getDocument(actor,path[1]),number=z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get('revision')??detail.document.revision),value=readDocumentRevision(actor,path[1],number);
   return new NextResponse(value.input.content,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="document-r${number}.txt"; filename*=UTF-8''${encodeURIComponent(value.input.fileName).replaceAll("'",'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
  }
 }
 if(request.method==='POST'&&path.length===2){
  if(path[1]==='import')return json(await previewDocumentImport(actor,await body()));
  if(path[1]==='discard-import'){const {id}=z.object({id:z.string().min(1).max(150)}).strict().parse(await body());return json(discardDocumentImport(actor,id));}
  if(path[1]==='save')return json(saveDocument(actor,documentSaveSchema.parse(await body())));
  if(path[1]==='withdraw')return json(withdrawDocument(actor,documentWithdrawSchema.parse(await body())));
 }
 throw new AppError(404,'This document action is unavailable.');
}
