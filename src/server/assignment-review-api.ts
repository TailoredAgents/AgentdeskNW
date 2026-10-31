import {NextRequest,NextResponse} from 'next/server';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {listAssignmentReviews,getAssignmentReview,decideAssignmentReview,assignmentDecisionSchema} from './assignment-reviews';
export async function assignmentReviewRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='assignment-reviews')return undefined;
 const json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&request.method==='GET')return json({reviews:listAssignmentReviews(actor)});
 if(path.length===2&&request.method==='GET')return json(getAssignmentReview(actor,path[1]));
 if(path.length===3&&path[2]==='decision'&&request.method==='POST')return json(decideAssignmentReview(actor,path[1],assignmentDecisionSchema.parse(await body())));
 throw new AppError(404,'This assignment review operation is not available.');
}
