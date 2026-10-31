import type {Evidence,Prospect} from '../lib/contracts';
export const researchEvidenceMethod='research-evidence-v2';
function sourceKey(url:string|null):string|null {try{if(!url)return null;const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))return null;parsed.hash='';for(const key of [...parsed.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))parsed.searchParams.delete(key);parsed.searchParams.sort();return parsed.toString().replace(/\/$/,'');}catch{return null;}}
export function reviewResearchEvidence(prospect:Pick<Prospect,'evidence'|'synthetic'|'contactStatus'|'phone'|'contactSourceUrl'>,at=new Date()){
 const cautions:string[]=[],sources=new Map<string,Evidence>(),sales=new Map<string,Evidence[]>();
 let stale=0,undated=0,invalid=0;
 for(const evidence of prospect.evidence){
  const date=Date.parse(evidence.observedAt),age=(at.getTime()-date)/86400000,key=sourceKey(evidence.url);
  if(!Number.isFinite(date)){undated++;continue;}if(age<0){invalid++;continue;}if(age>90){stale++;continue;}
  if(!key&&!prospect.synthetic)continue;
  const unique=key??`synthetic:${evidence.id}`;if(!sources.has(unique))sources.set(unique,evidence);
  if(evidence.kind!=='reported_transaction'||!evidence.propertyAddress||!evidence.transactionDate)continue;
  const sold=Date.parse(evidence.transactionDate);if(!Number.isFinite(sold)||sold>at.getTime()){invalid++;continue;}
  const saleKey=evidence.propertyAddress.toLowerCase().replace(/[^a-z0-9]/g,'')+':'+evidence.transactionDate.slice(0,10);
  const group=sales.get(saleKey)??[];group.push(evidence);sales.set(saleKey,group);
 }
 const conflicts:string[]=[],transactions:Evidence[]=[];
 for(const group of sales.values()){
  if(new Set(group.flatMap(item=>item.price===null||item.price===undefined?[]:[item.price])).size>1){conflicts.push(`Conflicting reported prices for ${group[0].propertyAddress} on ${group[0].transactionDate}; reconcile the original records.`);continue;}
  transactions.push(group[0]);
 }
 if(stale)cautions.push(`${stale} source entry/entries were observed over 90 days ago; reconfirm before relying on them. This is a provisional freshness window.`);
 if(undated||invalid)cautions.push(`${undated+invalid} source/date issue(s) need review; unknown or future evidence does not establish completed activity.`);
 if(sources.size<prospect.evidence.length)cautions.push('Repeated, missing, stale or invalid source entries do not add evidence breadth.');
 if(!transactions.length&&!prospect.synthetic)cautions.push('No distinct usable reported transaction supports the current purchase pattern. A profile or contact page alone is insufficient.');
 cautions.push(...conflicts);
 if(prospect.phone&&prospect.contactStatus!=='verified')cautions.push('The phone number and its association remain unverified; do not infer contact permission.');
 const domains=[...new Set([...sources.keys()].filter(key=>!key.startsWith('synthetic:')).map(key=>new URL(key).hostname.replace(/^www\./,'')))];
 return {method:researchEvidenceMethod,uniqueSources:sources.size,sourceDomains:domains,transactions,conflicts,cautions,nextAction:conflicts.length?'Reconcile conflicting transaction evidence before using this purchase pattern.':!transactions.length&&!prospect.synthetic?'Find a dated transaction source before treating this as a purchase-pattern lead.':prospect.phone?'Review business identity, contact association and permission before preparing outreach.':'Review the business identity and obtain a sourced contact if external outreach is requested.'};
}
