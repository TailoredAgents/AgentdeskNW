import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {companyAuthConfig,companySessionActor} from '@/server/company-auth';
import {getActor} from '@/server/auth';
import {beginConnectionOAuth,completeConnectionOAuth,disconnectOAuthProvider,oauthProfile} from '@/server/oauth-connections';
import {AppError} from '@/server/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const cookie='__Host-agentdesk_connection',options={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};
async function route(request:NextRequest,{params}:{params:Promise<{action:string}>}){
 try{
  const config=companyAuthConfig(),{action}=await params;if(request.headers.get('host')!==new URL(config.origin).host)throw new AppError(403,'This workspace address is not authorized.');
  // A provider redirect needs the Lax company cookie; other actions retain normal CSRF checks.
  const callback=action==='callback'&&request.method==='GET';
  const actor=callback?companySessionActor(request.cookies.get('__Host-agentdesk_company')?.value):getActor(request);if(!actor)throw new AppError(401,'Sign in with your company account before connecting a source.');
  if(callback){
   const query=request.nextUrl.searchParams;if(query.getAll('state').length!==1||query.getAll('code').length!==1||query.has('error'))throw new AppError(401,'Connection authorization was not completed.');
   await completeConnectionOAuth(actor,{state:query.get('state')!,code:query.get('code')!,browser:request.cookies.get(cookie)?.value??''});
   const response=NextResponse.redirect(`${config.origin}/?view=settings`,303);response.cookies.set(cookie,'',{...options,maxAge:0});response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
  }
  if(request.method==='POST'&&['start','disconnect'].includes(action)){
   const raw=await request.text();if(raw.length>2000)throw new AppError(413,'Request too large.');
   const input=z.object({connectionId:z.string().min(1).max(160),version:z.number().int().positive()}).strict().parse(JSON.parse(raw));
   if(action==='start'){
    if(oauthProfile(input.connectionId).redirectUri!==`${config.origin}/api/connection-auth/callback`)throw new AppError(503,'Use this workspace’s exact approved OAuth callback.');
    const login=beginConnectionOAuth(actor,input.connectionId,input.version),response=NextResponse.json({url:login.url},{headers:{'Cache-Control':'no-store'}});response.cookies.set(cookie,login.browser,{...options,maxAge:login.maxAge});return response;
   }
   const outcome=await disconnectOAuthProvider(actor,input.connectionId,input.version);return NextResponse.json(outcome,{headers:{'Cache-Control':'no-store'}});
  }
  return NextResponse.json({error:'Connection action not found.'},{status:404});
 }catch(error){return NextResponse.json({error:error instanceof AppError?error.message:'The connection request could not be completed.'},{status:error instanceof AppError?error.status:400,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
}
export {route as GET,route as POST};
