import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { Actor, Role } from '@/lib/contracts';
import { demoActor, AppError } from './services';

const COOKIE = 'agentdesk_session';
const fallbackSecret = randomBytes(32).toString('hex');
const secret = () => process.env.AGENTDESK_SESSION_SECRET || fallbackSecret;
const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function assertLocalDemo(request: NextRequest) {
  let host: string;
  try { host = new URL(`http://${request.headers.get('host') || ''}`).hostname; } catch { throw new AppError(403, 'Local access only.'); }
  if (!loopback(host) || process.env.AGENTDESK_DEMO !== 'true') throw new AppError(403, 'This build requires local demo access. Production identity is not configured.');
  if (process.env.NODE_ENV === 'production' && process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO !== 'true') throw new AppError(403, 'Production identity is not configured. The local built demo requires explicit opt-in.');
  const origin = request.headers.get('origin');
  if (origin && origin !== `http://${request.headers.get('host')}` && origin !== `https://${request.headers.get('host')}`) throw new AppError(403, 'Cross-origin requests are not allowed.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, 'Cross-site requests are not allowed.');
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('x-agentdesk-request') !== '1') throw new AppError(403, 'Request verification is required.');
}

export function getActor(request: NextRequest): Actor | null {
  assertLocalDemo(request);
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(data, 'base64url').toString()) as {role:Role;exp:number};
    if (!['dispositions','acquisitions','manager'].includes(claims.role) || claims.exp < Date.now()) return null;
    return demoActor(claims.role);
  } catch { return null; }
}

export function setSession(response: NextResponse, role: Role) {
  const data = Buffer.from(JSON.stringify({role, exp: Date.now()+8*60*60*1000})).toString('base64url');
  response.cookies.set(COOKIE, `${data}.${sign(data)}`, {httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:8*60*60});
}

const buckets = new Map<string, {start:number;count:number}>();
export function rateLimit(actor:Actor, kind:string, limit=60) {
  const now=Date.now();
  const key=`${actor.organizationId}:${actor.id}:${kind}`;
  let bucket=buckets.get(key);
  if(!bucket || now-bucket.start>60_000) { bucket={start:now,count:0}; buckets.set(key,bucket); }
  if(++bucket.count>limit) throw new AppError(429,'Too many requests. Please try again in a minute.');
  if(buckets.size>1000) for(const [id,value] of buckets) if(now-value.start>60_000) buckets.delete(id);
}
