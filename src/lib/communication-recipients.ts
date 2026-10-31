import type {CommunicationParty} from './communications-contracts';
/** Addresses only in the compact editor; the saved/review envelope is always explicit. */
export const ccText=(parties:CommunicationParty[]|undefined)=>parties?.map(p=>p.address).join(', ')??'';
export function parseCc(value:string):CommunicationParty[]{return value.split(/[;,\n]/).map(address=>address.trim()).filter(Boolean).map(address=>({name:'',address}));}
