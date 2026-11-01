/** HTTP rejection is distinct from an unreadable success: the latter may have saved work. */
export class ApiResponseError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='ApiResponseError';}
}

function fallbackMessage(status:number):string {
 if(status===401)return 'Sign in again to open your workspace.';
 if(status===403)return 'This request is no longer available to your account.';
 if(status===429)return 'The workspace is busy. Wait a moment, then check your saved work before retrying.';
 return 'The workspace could not confirm this request. Check your saved work before retrying.';
}

export function transportFailureMessage(error:unknown):string {
 return error instanceof Error&&error.name==='AbortError'
  ?'The connection timed out before the workspace could confirm the result. Check your saved work before retrying.'
  :'The workspace could not be reached. Check your connection, then check your saved work before retrying.';
}

/** Never includes an HTML error page or raw transport/provider details, and never retries. */
export async function readApiResponse<T>(response:Response):Promise<T> {
 let value:unknown;
 try{value=await response.json();}catch{
  if(!response.ok)throw new ApiResponseError(fallbackMessage(response.status),response.status);
  throw new Error('The workspace returned a response that could not be read. Check your saved work before retrying.');
 }
 if(!response.ok){
  const supplied=typeof value==='object'&&value!==null&&'error' in value?value.error:null;
  const message=typeof supplied==='string'&&supplied.trim()&&supplied.length<=2000&&!/<[^>]+>/.test(supplied)?supplied:fallbackMessage(response.status);
  throw new ApiResponseError(message,response.status);
 }
 return value as T;
}
