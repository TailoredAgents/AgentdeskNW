import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { Actor, Role } from '@/lib/contracts';
import { demoActor, AppError } from './services';
import { demoOrigin, hostedDemo, validateHostedDemo } from './demo-config';

const COOKIE = 'agentdesk_session';
const fallbackSecret = randomBytes(32).toString('hex');
const secret = () => process.env.AGENTDESK_SESSION_SECRET || fallbackSecret;
const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function assertLocalDemo(request: NextRequest) {
  let expectedOrigin: string;
  if (hostedDemo()) {
    try { validateHostedDemo(); expectedOrigin = demoOrigin(); } catch { throw new AppError(503, 'The private demonstration is being prepared. Please try again shortly.'); }
    if (request.headers.get('host') !== new URL(expectedOrigin).host) throw new AppError(403, 'This demo address is not authorized.');
  } else {
    let host: string;
    try { host = new URL(`http://${request.headers.get('host') || ''}`).hostname; } catch { throw new AppError(403, 'Local access only.'); }
    if (!loopback(host) || process.env.AGENTDESK_DEMO !== 'true') throw new AppError(403, 'This build requires local demo access. Production identity is not configured.');
    if (process.env.NODE_ENV === 'production' && process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO !== 'true') throw new AppError(403, 'Production identity is not configured. The local built demo requires explicit opt-in.');
    expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== expectedOrigin) throw new AppError(403, 'Cross-origin requests are not allowed.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, 'Cross-site requests are not allowed.');
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('x-agentdesk-request') !== '1') throw new AppError(403, 'Request verification is required.');
}

export function getActor(request: NextRequest): Actor | null {
  assertLocalDemo(request);
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const [data, signature, extra] = token.split('.');
  if (extra) return null;
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(data, 'base64url').toString()) as {role:Role;exp:number;aud?:string};
    if (!['dispositions','acquisitions','manager'].includes(claims.role) || !Number.isFinite(claims.exp) || claims.exp < Date.now() || (hostedDemo() && claims.aud !== demoOrigin())) return null;
    return demoActor(claims.role);
  } catch { return null; }
}

export function setSession(response: NextResponse, role: Role) {
  const data = Buffer.from(JSON.stringify({role, ...(hostedDemo() ? {aud:demoOrigin()} : {}), exp: Date.now()+8*60*60*1000})).toString('base64url');
  response.cookies.set(COOKIE, `${data}.${sign(data)}`, {httpOnly:true,sameSite:'strict',secure:hostedDemo(),path:'/',maxAge:8*60*60});
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

// A global bounded login bucket avoids trusting spoofable forwarding headers.
let loginWindow = {start:0,count:0};
export function verifyDemoAccess(code:string) {
  if (!hostedDemo()) throw new AppError(404, 'Private demo access is not enabled.');
  validateHostedDemo();
  const now = Date.now();
  if (now - loginWindow.start > 60_000) loginWindow = {start:now,count:0};
  if (++loginWindow.count > 20) throw new AppError(429, 'Please wait a minute before trying the access code again.');
  const actual = createHmac('sha256', secret()).update(code).digest();
  const expected = createHmac('sha256', secret()).update(process.env.AGENTDESK_DEMO_ACCESS_CODE!).digest();
  if (!timingSafeEqual(actual, expected)) throw new AppError(401, 'That access code was not recognized.');
}
