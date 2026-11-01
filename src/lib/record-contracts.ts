import type {Investor,Property} from './contracts';
import type {InvestorJourney} from './journey-contracts';
export interface RecordBoard {investors:Investor[];properties:Property[]}
export type RecordDetail={kind:'investor';record:Investor;journey:InvestorJourney|null;notice:string}|{kind:'property';record:Property;activity?:PropertyActivity|null;notice:string};

export interface PropertyActivity {
 releaseStatus:string;notice:string;
 buyers:{investorId:string;name:string;score:number;reasons:string[];cautions:string[];nextAction:string;question:string}[];
 conversations:{threadId:string;name:string;account:string;draft:boolean;current:boolean;simulatedSent:boolean;reply:{text:string;receivedAt:string}|null;followUps:{id:string;title:string;status:string}[]}[];
}
