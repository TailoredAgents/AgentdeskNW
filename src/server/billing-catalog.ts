import type { CatalogProduct } from '../lib/billing-contracts';
export const coreFeatures=['call-notetaker','workflow-navigator','salesforce-assistant','daily-coordinator'];
export const addonPrices:Record<string,number>={'investor-hunter':79,'buyer-matchmaker':25,'investor-qualification':15,'investor-relationship':19,'deal-marketing':19,'deal-analyst':29,'transaction-coordinator':19,'acquisition-lead':19,'valuation-diligence':29,'acquisition-disposition':15,'team-performance':39,'onboarding-coaching':19};
export const planSeeds:CatalogProduct[]=[
 {id:'core',name:'AgentDesk Core',kind:'plan',version:1,monthlyCents:4900,features:coreFeatures,allowances:{voice_minutes:60,text_tokens:100000},provisional:true},
 {id:'dispositions-productivity',name:'Dispositions Productivity',kind:'plan',version:1,monthlyCents:10800,features:[...coreFeatures,'buyer-matchmaker','investor-qualification','investor-relationship','deal-marketing'],allowances:{voice_minutes:60,text_tokens:100000},provisional:true},
 {id:'dispositions-complete',name:'Dispositions Complete',kind:'plan',version:1,monthlyCents:17900,features:[...coreFeatures,'investor-hunter','buyer-matchmaker','investor-qualification','investor-relationship','deal-marketing','deal-analyst'],allowances:{voice_minutes:60,text_tokens:100000,research_credits:1,research_target:25},provisional:true},
 {id:'acquisitions-suite',name:'Acquisitions Suite',kind:'plan',version:1,monthlyCents:9800,features:[...coreFeatures,'acquisition-lead','valuation-diligence','acquisition-disposition'],allowances:{voice_minutes:60,text_tokens:100000},provisional:true},
 {id:'management-suite',name:'Management Suite',kind:'plan',version:1,monthlyCents:9800,features:[...coreFeatures,'team-performance','onboarding-coaching'],allowances:{voice_minutes:60,text_tokens:100000},provisional:true},
];
export const pricingNotice='Proposed USD monthly pricing. Local simulation only; no payment collected. Text allowance of 100,000 tokens is a configurable planning assumption; provider costs are unknown.';
