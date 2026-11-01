import type {Evidence,Prospect} from '../lib/contracts';
export const researchEvidenceMethod='research-evidence-v3';
function sourceKey(url:string|null):string|null {try{if(!url)return null;const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;parsed.hash='';for(const key of [...parsed.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))parsed.searchParams.delete(key);parsed.searchParams.sort();return parsed.toString().replace(/\/$/,'');}catch{return null;}}
function saleDate(value:string):number|null {if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return null;const stamp=Date.parse(value);return Number.isFinite(stamp)&&new Date(Date.parse(value.slice(0,10))).toISOString().slice(0,10)===value.slice(0,10)?stamp:null;}
export function reviewResearchEvidence(prospect:Pick<Prospect,'evidence'|'synthetic'|'contactStatus'|'phone'|'contactSourceUrl'>,at=new Date()){
 const cautions:string[]=[],sources=new Map<string,Evidence>(),sales=new Map<string,Evidence[]>();
 let stale=0,undated=0,invalid=0;
 for(const evidence of prospect.evidence){
  const date=saleDate(evidence.observedAt),key=sourceKey(evidence.url);
  if(date===null){undated++;continue;}const age=(at.getTime()-date)/86400000;if(age<0){invalid++;continue;}if(age>90){stale++;continue;}
  if(!key&&!prospect.synthetic)continue;
  const unique=key??`synthetic:${evidence.id}`;if(!sources.has(unique))sources.set(unique,evidence);
  if(evidence.kind!=='reported_transaction'||!evidence.propertyAddress?.trim()||/^(unknown|unavailable|not provided|not found|n\/a|tbd)$/i.test(evidence.propertyAddress.trim())||!evidence.transactionDate)continue;
  const sold=saleDate(evidence.transactionDate);if(sold===null||sold>at.getTime()||sold>date){invalid++;continue;}
  const saleKey=evidence.propertyAddress.toLowerCase().replace(/[^a-z0-9]/g,'')+':'+evidence.transactionDate.slice(0,10);
  const group=sales.get(saleKey)??[];group.push(evidence);sales.set(saleKey,group);
 }
 const conflicts:string[]=[],transactions:Evidence[]=[];
 for(const group of sales.values()){
  if(new Set(group.flatMap(item=>item.price===null||item.price===undefined?[]:[item.price])).size>1){conflicts.push(`Conflicting reported prices for ${group[0].propertyAddress} on ${group[0].transactionDate}; reconcile the original records.`);continue;}
  // Keep one actual cited record; choose the most informative one without splicing claims across sources.
  transactions.push([...group].sort((a,b)=>Number(!!b.price)-Number(!!a.price)||Number(!!b.propertyType)-Number(!!a.propertyType)||a.id.localeCompare(b.id))[0]);
 }
 if(stale)cautions.push(`${stale} source entry/entries were observed over 90 days ago; reconfirm before relying on them. This is a provisional freshness window.`);
 if(undated||invalid)cautions.push(`${undated+invalid} source/date issue(s) need review; unknown, impossible or future dates, including a sale after its source observation, do not establish completed activity.`);
 if(sources.size<prospect.evidence.length)cautions.push('Repeated, missing, stale or invalid source entries do not add evidence breadth.');
 if(!transactions.length&&!prospect.synthetic)cautions.push('No distinct usable reported transaction supports the current purchase pattern. A profile or contact page alone is insufficient.');
 cautions.push(...conflicts);
 if(prospect.phone&&prospect.contactStatus!=='verified')cautions.push('The phone number and its association remain unverified; do not infer contact permission.');
 const domains=[...new Set([...sources.keys()].filter(key=>!key.startsWith('synthetic:')).map(key=>new URL(key).hostname.replace(/^www\./,'')))];
 return {method:researchEvidenceMethod,uniqueSources:sources.size,sourceDomains:domains,transactions,conflicts,cautions,nextAction:conflicts.length?'Reconcile conflicting transaction evidence before using this purchase pattern.':!transactions.length&&!prospect.synthetic?'Find a dated transaction source before treating this as a purchase-pattern lead.':prospect.phone?'Review business identity, contact association and permission before preparing outreach.':'Review the business identity and obtain a sourced contact if external outreach is requested.'};
}
