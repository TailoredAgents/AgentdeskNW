import type { ResearchInput } from '../lib/contracts';
import { AppError } from './db';

/** A licensed record is provenance, not proof that a named person owns a company. */
export interface RecordedPurchase {
 provider:string; recordId:string; sourceUrl:string|null; retrievedAt:string;
 purchasingEntity:string; parcelId:string|null; propertyAddress:string;
 transactionDate:string|null; recordedAt:string|null; purchasePrice:number|null; propertyType:string|null;
 attribution:'licensed_provider_record'; identityVerification:'not_independently_verified';
}
export interface LicensedPropertyDataProvider {
 readonly id:string;
 discoverPurchases(input:ResearchInput,scope:{maxRecords:number;signal:AbortSignal}):Promise<RecordedPurchase[]>;
}
export const licensedPropertyDataStatus={
 provider:'attom',implemented:false,connected:false,
 documentation:'https://api.developer.attomdata.com/docs',
 missing:['Authorized product subscription and API key','Confirmed Georgia transaction coverage and permitted reuse/retention','Product-specific buyer/entity field mapping and fixture validation'],
} as const;
/** Deliberately disconnected. No speculative endpoint or assumed account entitlement is called. */
export const licensedPropertyDataProvider:LicensedPropertyDataProvider={
 id:'licensed-property-data-unconfigured',
 async discoverPurchases(){throw new AppError(503,'Licensed transaction research is disconnected. Public web findings cannot establish verified recorded purchases or company ownership. Configure and validate an authorized property-data product before enabling this adapter.');},
};
