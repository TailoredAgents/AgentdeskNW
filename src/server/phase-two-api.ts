import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import type { Actor } from '@/lib/contracts';
import type { PhaseTwoState } from '@/lib/intelligence-contracts';
import * as intelligence from './intelligence';
import * as workflows from './workflows';
import * as debrief from './debrief';
import { getDb,assertActor } from './db';
import { getOwnershipPolicy,updateOwnershipPolicy } from './access';

const id=z.string().min(1).max(150);
const channel=z.enum(['email','sms','personal_text','imessage','slack']);
const text=z.string().max(10000);
const list=z.array(z.string().min(1).max(150)).max(100);

export function getPhaseTwoState(actor:Actor):PhaseTwoState{
  assertActor(actor);
  const members=getDb().prepare('SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? ORDER BY u.name').all(actor.organizationId,actor.officeId) as PhaseTwoState['members'];
  return {intelligence:intelligence.listInvestorIntelligence(actor),releases:workflows.listReleases(actor),callingQueue:intelligence.getCallingQueue(actor),packages:workflows.listPackages(actor),debriefs:debrief.listDebriefs(actor),templates:workflows.listTemplates(actor),members,policy:intelligence.getDisclosurePolicy(actor),capabilities:{slack:'unconfigured',sms:'paid_addon_planned',delivery:'copy_only'}};
}

/** Shares the authenticated route's CSRF, rate limits, body bound and error handling. */
export async function phaseTwoRoute(request:NextRequest,actor:Actor,path:string[],readBody:()=>Promise<unknown>):Promise<NextResponse|undefined>{
  const [resource,recordId,operation]=path;const method=request.method;
  const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const propertyId=request.nextUrl.searchParams.get('propertyId')||undefined;
  if(propertyId)id.parse(propertyId);
  if(resource==='intelligence'&&method==='GET')return json(getPhaseTwoState(actor));
  if(resource==='calling-queue'&&method==='GET')return json(intelligence.getCallingQueue(actor,{propertyId,includeDismissed:request.nextUrl.searchParams.get('includeDismissed')==='true'}));
  if(resource==='investors'&&recordId){
    if(operation==='intelligence'&&method==='GET')return json(intelligence.getInvestorIntelligence(actor,recordId));
    if(operation==='briefing'&&method==='GET')return json(intelligence.getCallBriefing(actor,recordId,propertyId));
    if(operation==='buy-boxes'&&method==='POST'){
      const input=z.object({input:intelligence.buyBoxInputSchema,existingId:id.optional(),buyBoxId:id.optional()}).strict().parse(await readBody());
      return json(intelligence.proposeBuyBox(actor,recordId,input.input,input.existingId??input.buyBoxId),201);
    }
    if(operation==='disclosure'&&method==='POST'){
      const input=z.object({status:z.enum(['unknown','not_requested','prepared','sent','opened','signed','declined','expired']),version:z.string().min(1).max(100),documentRef:z.string().max(2000).nullable(),expiresAt:z.string().datetime({offset:true}).nullable().optional()}).strict().parse(await readBody());
      return json(intelligence.recordDemoDisclosure(actor,recordId,input));
    }
    if(operation==='priority'&&method==='POST'){
      const input=z.object({dismissed:z.boolean().optional(),manualPriority:z.number().int().min(-100).max(100).optional()}).strict().parse(await readBody());
      return json(intelligence.setCallPriority(actor,recordId,input));
    }
    if(operation==='outcome'&&method==='POST'){
      const input=intelligence.callOutcomeSchema.parse(await readBody());
      return json(intelligence.recordCallOutcome(actor,recordId,input));
    }
    if(operation==='sharing'&&method==='POST'){const input=z.object({visibility:z.enum(['owner','office','organization','shared']),sharedWith:list}).strict().parse(await readBody());return json(intelligence.setInvestorSharing(actor,recordId,input));}
    if(operation==='assignment'&&method==='POST'){const input=z.object({ownerId:id}).strict().parse(await readBody());return json(intelligence.assignInvestor(actor,recordId,input.ownerId));}
  }
  if(resource==='ownership-policy'&&method==='GET')return json(getOwnershipPolicy(actor));
  if(resource==='ownership-policy'&&method==='PATCH'){const input=z.object({organizationVisibility:z.boolean(),crossOfficeSharing:z.boolean(),managerAssignment:z.boolean()}).strict().parse(await readBody());return json(updateOwnershipPolicy(actor,input));}
  if(resource==='releases'){
    if(method==='GET')return json(recordId?workflows.getRelease(actor,recordId):workflows.listReleases(actor));
    if(method==='POST'&&!recordId)return json(workflows.saveRelease(actor,workflows.releaseInputSchema.parse(await readBody())),201);
  }
  if(resource==='packages'){
    if(method==='GET'&&!recordId)return json(workflows.listPackages(actor));
    if(method==='POST'&&!recordId){const input=z.object({investorId:id,releaseId:id,channel}).strict().parse(await readBody());return json(workflows.composePackage(actor,input),201);}
    if(recordId&&method==='PATCH'){const input=z.object({body:text.optional(),subject:z.string().max(500).optional()}).strict().parse(await readBody());return json(workflows.updatePackage(actor,recordId,input));}
    if(recordId&&method==='POST'&&operation==='approve')return json(workflows.approvePackage(actor,recordId));
    if(recordId&&method==='POST'&&operation==='handoff')return json(workflows.handoffPackage(actor,recordId));
  }
  if(resource==='debriefs'){
    if(method==='GET')return json(debrief.listDebriefs(actor));
    if(method==='POST'&&!recordId){const input=z.object({recap:z.string().trim().min(15).max(30000),investorId:id.optional(),propertyId:id.optional()}).strict().parse(await readBody());return json(debrief.createDebrief(actor,input),201);}
    if(recordId&&method==='POST'&&operation==='propose'){const input=z.object({investorId:id.optional(),propertyId:id.optional(),createFollowUp:z.boolean().optional()}).strict().parse(await readBody());return json(debrief.proposeDebrief(actor,recordId,input),201);}
  }
  if(resource==='templates'){
    if(method==='GET')return json(workflows.listTemplates(actor));
    if(method==='POST'){const input=z.object({id:id.optional(),name:z.string().min(1).max(150),channel,intro:z.string().max(2000),closing:z.string().max(2000),approved:z.boolean()}).strict().parse(await readBody());return json(workflows.saveTemplate(actor,input),201);}
  }
  return undefined;
}
