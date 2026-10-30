import {getRelationshipRecord,recordRelationshipReport,relationshipReportSchema} from './relationship-record';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Actor } from '@/lib/contracts';
import { employeeMemoryInputSchema, forgetEmployeeMemory, getEmployeeMemory, saveEmployeeMemory } from './memory';
import { getInvestorJourney, journeyObservationSchema, recordJourneyObservation, recommendInvestorNextStep } from './journey';

const id = z.string().min(1).max(150);
/** Uses the main route's authentication, CSRF, body limit and error handling. */
export async function memoryJourneyRoute(request: NextRequest, actor: Actor, path: string[], readBody: () => Promise<unknown>) {
  const [resource, investorId, action, child] = path;
  const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'no-store'}});
  if (resource === 'memory' && path.length === 1) {
    if (request.method === 'GET') return json(getEmployeeMemory(actor));
    if (request.method === 'PATCH') return json(saveEmployeeMemory(actor, employeeMemoryInputSchema.parse(await readBody())));
    if (request.method === 'DELETE') {
      const {expectedVersion} = z.object({expectedVersion: z.number().int().nonnegative().optional()}).strict().parse(await readBody());
      return json(forgetEmployeeMemory(actor, expectedVersion));
    }
  }
  if (resource !== 'investors' || !investorId) return;
  id.parse(investorId);
  if (action === 'relationship-record' && path.length === 3 && request.method === 'GET') return json(getRelationshipRecord(actor,investorId));
  if (action === 'relationship-record' && child === 'reports' && path.length === 4 && request.method === 'POST') {
    const body=z.record(z.string(),z.unknown()).parse(await readBody());
    if('investorId' in body && body.investorId!==investorId) return json({error:'The report investor must match the selected record.'},400);
    return json(recordRelationshipReport(actor,relationshipReportSchema.parse({...body,investorId})),201);
  }
  if (action === 'journey' && path.length === 3 && request.method === 'GET') return json(getInvestorJourney(actor, investorId));
  if (action === 'recommendation' && path.length === 3 && request.method === 'POST') {
    const {propertyId} = z.object({propertyId: id.nullable().optional()}).strict().parse(await readBody());
    return json(recommendInvestorNextStep(actor, investorId, propertyId));
  }
  if (action === 'journey' && child === 'observations' && path.length === 4 && request.method === 'POST') {
    const body = z.record(z.string(), z.unknown()).parse(await readBody());
    const input = journeyObservationSchema.parse({...body, investorId});
    return json(recordJourneyObservation(actor, {...input, investorId}), 201);
  }
}
