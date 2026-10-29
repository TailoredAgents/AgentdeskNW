import type { Investor, Prospect, ResearchInput } from '../lib/contracts';
import { z } from 'zod';

export const researchInputSchema=z.object({
  address:z.string().trim().min(5).max(300), county:z.string().trim().max(100),
  propertyType:z.string().trim().max(100).optional(), price:z.number().finite().min(0).max(100_000_000), strategy:z.string().trim().max(100), limit:z.number().int().min(1).max(100),
}).strict();
export const defaultScoreWeights={propertyType:25,price:25,strategy:20,geography:10,recency:10,activity:5,evidence:5};
export type ScoreWeights=typeof defaultScoreWeights;
export function normalizeStrategy(value:string):string {
 const key=value.toLowerCase().replace(/[^a-z]/g,'');
 if(['fixflip','fixandflip','flip','flips','flipper','flippers'].includes(key))return 'fix-and-flip';
 if(['buyhold','buyandhold','rental','rentals','rentalinvestor','rentalinvestors'].includes(key))return 'buy-and-hold';
 if(['both','any','all'].includes(key))return 'both';
 return key;
}
export function normalizePropertyType(value:string):string {
 const key=value.toLowerCase().replace(/[^a-z]/g,'');
 if(['singlefamily','singlefamilyhome','sfr','sfh','detached'].includes(key))return 'single-family';
 if(['multifamily','multifamilyhome','duplex','triplex','fourplex'].includes(key))return 'multifamily';
 if(['townhome','townhouse','townhomes'].includes(key))return 'townhome';
 if(['condominium','condo','condos'].includes(key))return 'condominium';
 return key;
}
export const normalizeCounty=(value:string)=>value.trim().toLowerCase().replace(/\s+county$/,'');
export function strategiesMatch(first:string,second:string):boolean {
 const a=normalizeStrategy(first),b=normalizeStrategy(second);
 return !!a&&!!b&&(a==='both'||b==='both'||a===b);
}
export interface ResearchProvider {
  id:string; synthetic:boolean;
  discover(input:ResearchInput):Prospect[]|Promise<Prospect[]>;
}
export interface SynchronousResearchProvider extends ResearchProvider { discover(input:ResearchInput):Prospect[] }

export const normalizeEntity=(value:string)=>value.toLowerCase().replace(/\bl[\s.]*l[\s.]*c\b/g,'').replace(/\b(incorporated|inc|corp|corporation|ltd)\b/g,'').replace(/[^a-z0-9]/g,'');
export function classifyDuplicate(prospect:Pick<Prospect,'company'|'name'>,investors:Investor[]):{duplicateStatus:Prospect['duplicateStatus'];matchedInvestorId:string|null} {
  const company=normalizeEntity(prospect.company);
  const name=normalizeEntity(prospect.name);
  if (!company && !name) return {duplicateStatus:'uncertain',matchedInvestorId:null};
  const exact=investors.find(record=>company && normalizeEntity(record.company)===company);
  if(exact) return {duplicateStatus:'existing',matchedInvestorId:exact.id};
  const possible=investors.find(record=>name && normalizeEntity(record.name)===name || company.length>5 && normalizeEntity(record.company).length>5 && (normalizeEntity(record.company).includes(company)||company.includes(normalizeEntity(record.company))));
  if(possible) return {duplicateStatus:'possible_duplicate',matchedInvestorId:possible.id};
  return {duplicateStatus:'net_new',matchedInvestorId:null};
}
export function scoreProspect(prospect:Prospect,input:ResearchInput,weights:ScoreWeights=defaultScoreWeights,at=new Date()):Prospect {
  const total=Object.values(weights).reduce((sum,n)=>sum+n,0);
  if(total<=0||Object.values(weights).some(n=>!Number.isFinite(n)||n<0)) throw new Error('Score weights must be finite and nonnegative with positive total.');
  const ageDays=(at.getTime()-new Date(prospect.lastActivityAt).getTime())/86400000;
  const similarity=input.price>0?Math.max(0,1-Math.abs(prospect.typicalPrice-input.price)/input.price):0;
  const evidence=prospect.evidence.length?Math.min(1,prospect.evidence.length/2):0;
  const sameCounty=normalizeCounty(prospect.county)===normalizeCounty(input.county),sameStrategy=strategiesMatch(prospect.strategy,input.strategy);
  const sameType=!!input.propertyType&&!!prospect.propertyType&&normalizePropertyType(input.propertyType)===normalizePropertyType(prospect.propertyType);
  const factors={propertyType:sameType?1:0,geography:sameCounty?1:0.25,strategy:sameStrategy?1:0.25,price:similarity,recency:Number.isFinite(ageDays)&&ageDays>=0?Math.max(0,1-ageDays/365):0,activity:Math.max(0,Math.min(1,prospect.transactionCount/8)),evidence};
  const breakdown=Object.fromEntries(Object.entries(factors).map(([key,value])=>[key,Math.round(value*weights[key as keyof ScoreWeights]/total*1000)/10]));
  const score=Math.min(100,Math.round(Object.values(breakdown).reduce((sum,n)=>sum+n,0)));
  return {...prospect,score,scoreBreakdown:breakdown,rationale:`${!input.propertyType||!prospect.propertyType?'Property type not confirmed':sameType?'Similar property type':'Different property type'}; ${sameCounty?'Same county':'Different county'}; ${sameStrategy?'matching strategy':'different strategy'}; typical purchase $${prospect.typicalPrice.toLocaleString('en-US')}; ${prospect.transactionCount} ${prospect.synthetic?'fictional':'reported'} purchases. Relevance score only, not purchase intent. ${prospect.synthetic?'All evidence is synthetic.':''}`};
}

const fixtures=[
 ['Avery Collins','Redwood Revival LLC','Cobb','Fix & flip',225000,8,18],
 ['Morgan Ellis','Cedar & Stone Investments','Cobb','Fix & flip',245000,6,34],
 ['Jamie Parker','Juniper Property Partners','Cherokee','Fix & flip',275000,7,22],
 ['Mike Bennett','Peachtree Renewal LLC','Cobb','Fix & flip',240000,5,28],
 ['Taylor Brooks','Bluebird Rental Group','Cobb','Buy & hold',230000,9,45],
 ['Jordan Hayes','Summit Hearth Capital','Fulton','Fix & flip',310000,4,60],
 ['Casey Morgan','Riverbend Homes LLC','Cobb','Fix & flip',185000,3,92],
 ['Riley Adams','Fernwood Acquisitions','Cherokee','Buy & hold',290000,8,51],
 ['Quinn Foster','Limestone Living LLC','DeKalb','Buy & hold',205000,5,70],
 ['Alex Porter','Oakline Property Group Holdings','Cobb','Fix & flip',255000,4,40],
 ['Drew Sullivan','Willow Lane Ventures','Fulton','Fix & flip',370000,2,120],
 ['Cameron Reed','Maple Hill Restoration','Cobb','Fix & flip',235000,7,12],
] as const;
export const syntheticResearchProvider:SynchronousResearchProvider={
 id:'synthetic-fixtures-v1',synthetic:true,
 discover(input) {
  return fixtures.map(([name,company,county,strategy,typicalPrice,transactionCount,days],index)=>{
   const activity=new Date(Date.now()-days*86400000).toISOString();
   const propertyType=index===4||index===8?'Multifamily':'Single-family';
   const prospect:Prospect={propertyType,id:`prospect-fixture-${index+1}`,name,company,county,strategy,typicalPrice,transactionCount,lastActivityAt:activity,score:0,scoreBreakdown:{},rationale:'',duplicateStatus:'uncertain',matchedInvestorId:null,phone:null,contactStatus:'missing',synthetic:true,
    evidence:[{id:`evidence-${index+1}-a`,propertyType,title:'Synthetic transaction example',url:null,observedAt:activity,detail:`Fictional fixture: ${company} acquired a sample ${propertyType.toLowerCase()} property in ${county} County at $${typicalPrice.toLocaleString('en-US')}. Not a public-record finding.`,synthetic:true},{id:`evidence-${index+1}-b`,title:'Synthetic activity profile',url:null,observedAt:activity,detail:`Fictional fixture: ${transactionCount} sample acquisitions and a ${strategy.toLowerCase()} preference. No live verification or contact enrichment has occurred.`,synthetic:true}]};
   return scoreProspect(prospect,input);
  }).sort((a,b)=>b.score-a.score).slice(0,input.limit);
 }
};
