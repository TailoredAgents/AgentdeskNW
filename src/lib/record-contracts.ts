import type {Investor,Property} from './contracts';
import type {InvestorJourney} from './journey-contracts';
export interface RecordBoard {investors:Investor[];properties:Property[]}
export type RecordDetail={kind:'investor';record:Investor;journey:InvestorJourney|null;notice:string}|{kind:'property';record:Property;notice:string};
