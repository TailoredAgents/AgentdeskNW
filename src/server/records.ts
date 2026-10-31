import type {Actor} from '../lib/contracts';
import type {RecordBoard,RecordDetail} from '../lib/record-contracts';
import type {RecordTarget} from '../lib/workspace-links';
import {readInvestor,readInvestors,readProperty,readProperties} from './access';
import {featureAccess,requireFeature} from './billing';
import {getInvestorJourney} from './journey';
export function getRecordBoard(actor:Actor):RecordBoard {
 requireFeature(actor,'core');return {investors:readInvestors(actor),properties:readProperties(actor)};
}
export function getRecordDetail(actor:Actor,target:RecordTarget):RecordDetail {
 requireFeature(actor,'core');
 if(target.kind==='property')return {kind:'property',record:readProperty(actor,target.id),notice:'Current saved inventory facts. A visible record does not establish permission to market it, a verified valuation or a completed transaction.'};
 const record=readInvestor(actor,target.id),enabled=featureAccess(actor,'investor-relationship').allowed;
 return {kind:'investor',record,journey:enabled?getInvestorJourney(actor,target.id):null,notice:enabled?'Current relationship evidence. Employee reports, confirmed criteria and unresolved questions remain distinct.':'The current CRM record is available. Relationship history requires access to the relationship specialist.'};
}
