import {controlTextAssignment,textControlSchema} from './text-controls';
import {renewTextAssignment,assignmentRenewalSchema} from './text-renewal';
import {NextRequest,NextResponse} from 'next/server';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {listAssignmentReviews,getAssignmentReview,decideAssignmentReview,assignmentDecisionSchema,cancelAssignmentReview,assignmentCancellationSchema} from './assignment-reviews';
export async function assignmentReviewRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='assignment-reviews')return undefined;
 const json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&request.method==='GET')return json({reviews:listAssignmentReviews(actor)});
 if(path.length===2&&request.method==='GET')return json(getAssignmentReview(actor,path[1]));
 if(path.length===3&&path[2]==='decision'&&request.method==='POST')return json(decideAssignmentReview(actor,path[1],assignmentDecisionSchema.parse(await body())));
 if(path.length===3&&path[2]==='cancel'&&request.method==='POST')return json(cancelAssignmentReview(actor,path[1],assignmentCancellationSchema.parse(await body())));
 if(path.length===3&&path[2]==='renew'&&request.method==='POST')return json(renewTextAssignment(actor,path[1],assignmentRenewalSchema.parse(await body())));
 if(path.length===3&&path[2]==='control'&&request.method==='POST')return json(controlTextAssignment(actor,path[1],textControlSchema.parse(await body())));
 throw new AppError(404,'This assignment review operation is not available.');
}
