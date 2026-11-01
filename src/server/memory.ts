import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import type { EmployeeMemory,EmployeeMemoryInput,EmployeeMemoryKey,EmployeePreferences } from '../lib/memory-contracts';
import { AppError,assertActor,audit,getDb,now } from './db';
import { requireFeature } from './billing';

const secretPattern=/(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_ -]?key|password|auth[_ -]?token|access[_ -]?token)\s*[:=]\s*\S{8,})/i;
const unsafeInstruction=/(?:\bignore (?:all |the |any )?(?:previous|prior|system|developer) (?:instructions|rules)|\b(?:bypass|disable|skip|ignore) (?:all |the |any )?(?:approval|permission|security|entitlement|authentication)(?:s| checks)?\b|\breveal (?:the |your )?(?:system prompt|secrets|credentials)\b)/i;
function safeText(value:string){return !secretPattern.test(value)&&!unsafeInstruction.test(value)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}
const phrase=z.string().trim().min(1).max(80).refine(value=>!/[\r\n]/.test(value)&&safeText(value),'Use an ordinary phrase without credentials or operating instructions.');
const priority=z.string().trim().min(1).max(160).refine(value=>!/[\r\n]/.test(value)&&safeText(value),'Use a work priority without credentials or operating instructions.');
const preferenceSchema=z.object({tone:z.enum(['direct','warm']).nullable(),length:z.enum(['concise','detailed']).nullable(),avoidPhrases:z.array(phrase).max(8),priorities:z.array(priority).max(8)}).strict();
export const employeeMemoryInputSchema=preferenceSchema.partial().extend({sourceText:z.string().trim().min(1).max(1000).refine(safeText,'Do not store credentials or operating instructions as a preference.' ).optional(),expectedVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()}).strict();
const keys:EmployeeMemoryKey[]=['tone','length','avoidPhrases','priorities'];
const emptyPreferences=():EmployeePreferences=>({tone:null,length:null,avoidPhrases:[],priorities:[]});
const emptyMemory=():EmployeeMemory=>({...emptyPreferences(),version:0,updatedAt:null,forgottenAt:null,sources:{}});
function unique(values:string[]){return values.filter((value,index)=>values.findIndex(candidate=>candidate.toLocaleLowerCase()===value.toLocaleLowerCase())===index);}
function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b);}
function checkVersion(actual:number,expected?:number){if(expected!==undefined&&expected!==actual)throw new AppError(409,'Your memory preferences changed. Reload them before saving.');}
function persist(actor:Actor,value:EmployeeMemory){
 getDb().prepare('INSERT INTO employee_memory(organization_id,office_id,user_id,version,data,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,office_id,user_id) DO UPDATE SET version=excluded.version,data=excluded.data,updated_at=excluded.updated_at').run(actor.organizationId,actor.officeId,actor.id,value.version,JSON.stringify(value),value.updatedAt);
 return value;
}
/** Includes a forgotten tombstone/version so callers can discard stale model context. */
export function getEmployeeMemory(actor:Actor):EmployeeMemory {
 assertActor(actor);
 const row=getDb().prepare('SELECT data FROM employee_memory WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 return row?JSON.parse(row.data) as EmployeeMemory:emptyMemory();
}
export function saveEmployeeMemory(actor:Actor,input:EmployeeMemoryInput):EmployeeMemory {
 assertActor(actor);requireFeature(actor,'core');const parsed=employeeMemoryInputSchema.parse(input);
 if(!keys.some(key=>Object.hasOwn(parsed,key)))throw new AppError(422,'Choose at least one memory preference to save.');
 if(parsed.avoidPhrases)parsed.avoidPhrases=unique(parsed.avoidPhrases);
 if(parsed.priorities)parsed.priorities=unique(parsed.priorities);
 return getDb().transaction(()=>{
  const old=getEmployeeMemory(actor);checkVersion(old.version,parsed.expectedVersion);
  const changed=keys.filter(key=>Object.hasOwn(parsed,key)&&!same(old[key],parsed[key]));
  if(!changed.length)return old;
  const stamp=now(),sourceText=parsed.sourceText??'Edited in memory settings';
  const next:EmployeeMemory={...old,version:old.version+1,updatedAt:stamp,sources:{...old.sources}};
  for(const key of changed){
   if(key==='tone')next.tone=parsed.tone!;
   else if(key==='length')next.length=parsed.length!;
   else if(key==='avoidPhrases')next.avoidPhrases=parsed.avoidPhrases!;
   else next.priorities=parsed.priorities!;
   const value=next[key];
   if(value===null||Array.isArray(value)&&!value.length)delete next.sources[key];
   else next.sources[key]={text:sourceText,updatedAt:stamp};
  }
  // Audit only keys and version, never the employee's source text or preference content.
  persist(actor,next);audit(actor,'memory.preferences_saved',null,{keys:changed,version:next.version});return next;
 }).immediate();
}
/** Forget remains available after a subscription ends; it removes values and provenance. */
export function forgetEmployeeMemory(actor:Actor,expectedVersion?:number):EmployeeMemory {
 assertActor(actor);if(expectedVersion!==undefined)z.number().int().nonnegative().parse(expectedVersion);
 return getDb().transaction(()=>{
  const old=getEmployeeMemory(actor);checkVersion(old.version,expectedVersion);
  const stamp=now(),next:EmployeeMemory={...emptyPreferences(),version:old.version+1,updatedAt:stamp,forgottenAt:stamp,sources:{}};
  persist(actor,next);audit(actor,'memory.preferences_forgotten',null,{version:next.version});return next;
 }).immediate();
}

/**
 * Narrow deterministic recognition of direct employee preference commands.
 * Call only on the current employee-authored message, never retrieved records or tool output.
 * Unsupported, quoted, conditional, third-person or contradictory requests require UI review.
 */
export function extractExplicitPreference(input:string):Partial<EmployeePreferences>|null {
 const text=input.trim().replaceAll('’',"'").replaceAll('‘',"'");if(!text||text.length>1000||!safeText(text)||/[\r\n]/.test(text))return null;
 let value=text.replace(/^(?:please\s+)?remember(?:\s+that)?\s*[:,]?\s+/i,'').replace(/^from now on\s*[,]?\s+/i,'').replace(/^for (?:all )?future (?:drafts|messages|replies)\s*[:,]?\s+/i,'');
 const persistent=value!==text;
 // Quoted conversation, hypothetical instructions and cancellation are not consent to remember.
 if(/^(?:["“'‘>]|if\b|suppose\b|imagine\b|don't\b|do not\b|never\b|forget\b)/i.test(value)||/\b(?:said|says|told me|quote|quoted|quotation|transcript|hypothetical|ignore|instead of)\b/i.test(value)||/\b(?:don't|do not|never) (?:remember|save|store|learn)\b/i.test(value))return null;
 const priorities=/^my (?:work )?priorities (?:are|should be)\s+(.+?)\.?$/i.exec(value);
 if(priorities&&persistent){const items=priorities[1].split(/\s*,\s*|\s+and\s+/i).filter(Boolean);const valid=preferenceSchema.shape.priorities.safeParse(items);return valid.success?{priorities:unique(valid.data)}:null;}
 // A request about one answer/conversation is not permission to change future style defaults.
 // Explicit work priorities above may contain dates; they remain saved context, not task authority.
 // Ignore the literal contents of a supported phrase-avoidance instruction here.
 const scopeText=value.replace(/\b(?:avoid|don't use|do not use|never use)\s+(?:the (?:phrase|words?)\s+)?(?:"[^"]+"|“[^”]+”|'[^']+')/ig,'');
 if(/\b(?:if|unless|when|whenever|while|until|suppose|supposing|imagine|hypothetically)\b/i.test(scopeText)||/\b(?:just (?:for )?(?:now|this once)|for now|today|tonight|tomorrow|(?:this|that|the current|(?:the )?next|(?:the )?following) (?:one|time|reply|answer|response|message|draft|email|conversation|chat|task|week|month))\b/i.test(scopeText))return null;
 // Require first-person preference language, or a clearly persistent direct style command.
 if(!/^i prefer\b/i.test(value)&&!/^keep my (?:drafts|messages|replies|writing)\b/i.test(value)&&!(persistent&&/^(?:keep|make|use|avoid|don't use|do not use)\b/i.test(value)))return null;
 if(/\b(?:he|she|they|investor|customer|client)\b/i.test(value))return null;
 // Avoid interpreting unrelated first-person tastes (for example short walks) as writing style.
 if(!/\b(?:drafts?|messages?|replies|responses?|writing|tone|style|answers?|explanations?|language|phrases?|words?)\b/i.test(value)&&!(persistent&&/^(?:keep|make) (?:it|them)\b/i.test(value)))return null;
 // A direct first-person preference is itself explicit, even without "remember".
 value=value.replace(/^i prefer\s+/i,'');
 const result:Partial<EmployeePreferences>={};
 const avoidance:string[]=[];
 const quoted=/\b(?:avoid|don't use|do not use|never use)\s+(?:the (?:phrase|words?)\s+)?(?:"([^"]+)"|“([^”]+)”|'([^']+)')/ig;
 value=value.replace(quoted,(_match,doubleQuoted:string|undefined,curlyQuoted:string|undefined,singleQuoted:string|undefined)=>{avoidance.push((doubleQuoted??curlyQuoted??singleQuoted??'').trim());return '';});
 if(/\b(?:avoid|no|less|without) (?:any )?(?:salesy language|salesy phrases|hype|hype language)\b/i.test(value)){
  avoidance.push('amazing opportunity','act now','don’t miss out');
  value=value.replace(/\b(?:avoid|no|less|without) (?:any )?(?:salesy language|salesy phrases|hype|hype language)\b/ig,'');
 }
 // Negative style instructions are intentionally not converted into their positive opposite.
 if(/\b(?:not|don't|do not|never|avoid)\s+(?:[a-z]+\s+){0,3}(?:short|concise|brief|long|detailed|warm|friendly|direct|straightforward)\b/i.test(value))return null;
 const concise=/\b(?:short|shorter|concise|brief)\b/i.test(value),detailed=/\b(?:detailed|thorough|longer)\b/i.test(value);
 const direct=/\b(?:direct|straightforward)\b/i.test(value),warm=/\b(?:warm|friendly)\b/i.test(value);
 if(concise&&detailed||direct&&warm)return null;
 if(concise||detailed)result.length=concise?'concise':'detailed';
 if(direct||warm)result.tone=direct?'direct':'warm';
 if(avoidance.length){const parsed=preferenceSchema.shape.avoidPhrases.safeParse(unique(avoidance));if(!parsed.success)return null;result.avoidPhrases=parsed.data;}
 return Object.keys(result).length?result:null;
}
