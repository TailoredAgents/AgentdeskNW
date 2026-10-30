import type { Task } from './contracts';
import type { BuyBox, InvestorIntelligence } from './intelligence-contracts';
import type { EmployeeMemory } from './memory-contracts';

export type JourneyVerification = 'seeded_demo' | 'reviewed_record' | 'employee_reported' | 'unreviewed_extraction';
export interface JourneyEvidence {
  id: string;
  sourceRecordId: string;
  kind: 'crm' | 'buy_box' | 'relationship' | 'observation' | 'debrief' | 'task' | 'property';
  label: string;
  text: string;
  recordedAt: string | null;
  verification: JourneyVerification;
  source: string;
  propertyId: string | null;
}
export type JourneyObservationKind = 'objection' | 'property_pass' | 'resolved' | 'preference';
export interface JourneyObservationInput {
  investorId: string;
  kind: JourneyObservationKind;
  text: string;
  propertyId?: string | null;
  resolvesId?: string | null;
  eventKey: string;
}
export interface JourneyObservation {
  id: string;
  investorId: string;
  kind: JourneyObservationKind;
  text: string;
  propertyId: string | null;
  resolvesId: string | null;
  recordedAt: string;
  recordedBy: string;
  verification: 'employee_reported';
  status: 'open' | 'resolved';
  resolvedById: string | null;
}
export interface ConsideredProperty {
  propertyId: string;
  address: string;
  sourceIds: string[];
  status: 'mentioned' | 'pass_reported';
}
export interface InvestorJourney {
  investorId: string;
  investorName: string;
  synthetic: boolean;
  generatedAt: string;
  summary: string;
  activity: InvestorIntelligence['currentActivity'];
  lastOutcome: string | null;
  buyBoxes: BuyBox[];
  observations: JourneyObservation[];
  openIssues: JourneyObservation[];
  commitments: Task[];
  completedTasks: Task[];
  consideredProperties: ConsideredProperty[];
  evidence: JourneyEvidence[];
  unknowns: string[];
}
export type InvestorNextStepKind = 'confirm_timing' | 'resolve_objection' | 'review_pass' | 'fulfill_commitment' | 'review_observation' | 'resolve_eligibility' | 'clarify_fit' | 'clarify_qualification' | 'review_property' | 'relationship_check_in';
export interface InvestorNextStep {
  investorId: string;
  propertyId: string | null;
  generatedAt: string;
  action: { kind: InvestorNextStepKind; title: string; description: string };
  why: string[];
  evidence: JourneyEvidence[];
  unknowns: string[];
  draft: string | null;
  draftEligibility: { allowed: boolean; reasons: string[]; scope: 'relationship_only' | 'property_specific' };
  preferencesUsed: Pick<EmployeeMemory, 'tone' | 'length' | 'avoidPhrases' | 'priorities' | 'version'>;
  method: string[];
  deliveryStatus: 'not_sent';
  synthetic: boolean;
}
