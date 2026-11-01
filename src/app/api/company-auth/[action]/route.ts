import {NextRequest,NextResponse} from 'next/server';
import {beginCompanyLogin,completeCompanyLogin,companyAuthConfig,endCompanySession} from '@/server/company-auth';
import {assertLocalDemo} from '@/server/auth';
import {AppError} from '@/server/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const browserCookie='__Host-agentdesk_login',sessionCookie='__Host-agentdesk_company';
const options={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};
async function route(request:NextRequest,{params}:{params:Promise<{action:string}>}){
 try{
  const config=companyAuthConfig(),{action}=await params;
  if(request.headers.get('host')!==new URL(config.origin).host)throw new AppError(403,'This workspace address is not authorized.');
  if(action==='start'&&request.method==='GET'){
   const login=beginCompanyLogin(),response=NextResponse.redirect(login.url,303);response.cookies.set(browserCookie,login.browser,{...options,maxAge:login.maxAge});response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
  }
  if(action==='callback'&&request.method==='GET'){
   const query=request.nextUrl.searchParams;if(query.getAll('state').length!==1||query.getAll('code').length!==1||query.has('error'))throw new AppError(401,'Company sign-in was not completed.');
   const session=await completeCompanyLogin({state:query.get('state')!,code:query.get('code')!,browser:request.cookies.get(browserCookie)?.value??''});
   // Rotate rather than preserve a previously authenticated browser session.
   endCompanySession(request.cookies.get(sessionCookie)?.value);
   const response=NextResponse.redirect(config.origin,303);response.cookies.set(sessionCookie,session.token,{...options,maxAge:session.maxAge});response.cookies.set(browserCookie,'',{...options,maxAge:0});response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
  }
  if(action==='logout'&&request.method==='POST'){
   assertLocalDemo(request);endCompanySession(request.cookies.get(sessionCookie)?.value);const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});response.cookies.set(sessionCookie,'',{...options,maxAge:0});return response;
  }
  return NextResponse.json({error:'Company sign-in action not found.'},{status:404});
 }catch(error){
  if(request.method==='GET'){
   // Keep browser sign-in failures in the workspace UI; never reflect provider errors,
   // authorization codes or an untrusted redirect destination into this URL.
   const response=new NextResponse(null,{status:303,headers:{Location:'/?signin=unavailable','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
   response.cookies.set(browserCookie,'',{...options,maxAge:0});return response;
  }
  return NextResponse.json({error:error instanceof AppError?error.message:'Company sign-in is unavailable. Start again.'},{status:error instanceof AppError?error.status:503,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
}
export {route as GET,route as POST};
