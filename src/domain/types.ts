import type {
  Confidence,
  IdentifierScheme,
  Language,
  Market,
  PersonRole,
  Practice,
  RelationshipType,
  SignalType,
} from './taxonomy';

export interface Identifier {
  scheme: IdentifierScheme;
  value: string;
}

/** An entity named in a public record, before it is matched to our company or people tables. */
export interface Mention {
  ref: string;
  kind: 'company' | 'person' | 'authority';
  name: string;
  role?: string;
  identifiers?: Identifier[];
  market?: Market;
  /** For people: the ref of the company they act for in this record. */
  companyRef?: string;
  title?: string;
  personRole?: PersonRole;
  amount?: number;
  currency?: string;
  sectorCode?: string;
  attributes?: Record<string, unknown>;
}

export interface FocusSettings {
  practices?: Practice[];
  markets?: Market[];
  sectors?: string[];
  regions?: string[];
  minEmployees?: number;
  maxEmployees?: number;
  minDealSize?: number;
  maxDealSize?: number;
}

export interface PlaybookConfig {
  /** Firm-specific multiplier per signal type or exposure role; 1 means "use the swarm's view". */
  signalWeights: Record<string, number>;
  minLikelihood: number;
  /** Override for the window to act; when absent the swarm's window is used. */
  windowDays?: { min: number; max: number };
  cascadeDepth: number;
  firstNoteRoles: PersonRole[];
  winDefinition: 'meeting' | 'pitch' | 'instruction';
  exclusions: { sectors: string[]; companyIds: string[]; markets: Market[] };
  thresholds: {
    minEmployees?: number;
    maxEmployees?: number;
    minDealSize?: number;
    maxDealSize?: number;
    sectors?: string[];
    markets?: Market[];
  };
  autoSend: { enabled: boolean; kinds: Array<'warm' | 'cold'>; maxPerDay: number };
  excludeCompaniesInProceedings: boolean;
  /** Signal types that show a predicted need actually materialised (used by the scorecard). */
  outcomeSignals: SignalType[];
  description: string;
  watches: string[];
  predicts: string[];
}

export interface EvidenceItem {
  recordId?: string;
  signalId?: string;
  weight?: number;
  note: string;
}

export interface Contribution {
  feature: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface RoutePathStep {
  kind: 'partner' | 'contact' | 'person' | 'company';
  id: string;
  name: string;
  detail?: string;
}

export interface RouteCandidate {
  partnerId: string;
  partnerName: string;
  contactId: string;
  contactName: string;
  contactRole: string | null;
  tieStrength: number;
  interactions12m: number;
  lastInteractionAt: string | null;
  channel: string;
  score: number;
}

export interface Citation {
  recordId: string;
  url?: string | null;
  title?: string;
}

export interface ComplianceResult {
  ruleId: string | null;
  kind: string;
  passed: boolean;
  message: string;
}

export interface ModelWeights {
  [feature: string]: number;
}

export interface PredictionSummary {
  practice: Practice;
  likelihood: number;
  confidence: Confidence;
  windowMinDays: number;
  windowMaxDays: number;
}

export interface RelationshipEdge {
  id: string;
  fromCompanyId: string;
  toCompanyId: string;
  type: RelationshipType;
  amount: number | null;
  attributes: Record<string, unknown>;
}

export type { Language };
