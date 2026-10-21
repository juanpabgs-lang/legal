export const MARKETS = ['US', 'UK', 'FR', 'ES'] as const;
export type Market = (typeof MARKETS)[number];
export type SourceMarket = Market | 'GLOBAL';

export const PRACTICES = [
  'insolvency',
  'mna',
  'banking',
  'disputes',
  'employment',
  'real_estate',
  'regulatory',
  'procurement',
  'commercial',
] as const;
export type Practice = (typeof PRACTICES)[number];

export const PRACTICE_LABELS: Record<Practice, string> = {
  insolvency: 'Insolvency & Restructuring',
  mna: 'M&A & Private Equity',
  banking: 'Banking & Finance',
  disputes: 'Disputes & Litigation',
  employment: 'Employment',
  real_estate: 'Real Estate',
  regulatory: 'Regulatory & Competition',
  procurement: 'Public Procurement',
  commercial: 'Commercial',
};

export const SOURCE_KINDS = [
  'registry',
  'court',
  'insolvency',
  'tender',
  'regulator',
  'legislation',
  'press',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * Signal types the swarm may return from the detect task. Descriptions are sent to the
 * swarm as part of the contract so it knows what each label means.
 */
export const SIGNAL_TYPES = {
  'insolvency.proceedings_opened':
    'The company entered formal insolvency proceedings (administration, liquidation, Chapter 11/7, redressement or liquidation judiciaire, sauvegarde, concurso).',
  'insolvency.petition_filed': 'A petition to wind up or put the company into insolvency was filed against it.',
  'insolvency.creditor_named': 'The company is named as a creditor of another company in insolvency proceedings.',
  'insolvency.business_sale': 'The business or its assets are being sold out of insolvency (plan de cesión, cession, pre-pack).',
  'insolvency.proceedings_closed': 'Insolvency proceedings ended (closure, dissolution after liquidation).',
  'finance.security_registered': 'A lender registered new security (a charge, UCC filing, pledge or mortgage) over the company or its assets.',
  'finance.security_satisfied': 'Existing security over the company was released or satisfied.',
  'finance.covenant_breach': 'The company disclosed a default, covenant breach, acceleration, waiver or forbearance agreement.',
  'finance.material_agreement': 'The company entered or terminated a material financing or commercial agreement.',
  'finance.refinancing': 'The company announced a refinancing, new facility or bond issue.',
  'corporate.officer_change': 'Directors or senior officers were appointed, resigned or were removed.',
  'corporate.capital_change': 'Share capital was increased or reduced.',
  'corporate.ownership_change': 'Ownership or control of the company changed (share transfer, new controlling shareholder).',
  'corporate.acquisition_announced': 'An acquisition, merger, disposal or takeover involving the company was announced or completed.',
  'corporate.acquisition_interest': 'The company is reported to be bidding for, or in talks to buy, another business or its assets.',
  'corporate.restructuring_costs': 'The company announced exit, disposal or restructuring costs, closures or impairments.',
  'corporate.auditor_change': 'The company changed or lost its auditor, or restated its accounts.',
  'corporate.late_filing': 'The company is late filing accounts or other statutory documents.',
  'corporate.dissolution': 'The company is being struck off, dissolved or wound up voluntarily while solvent.',
  'litigation.claim_filed': 'A new lawsuit, claim or arbitration was filed by or against the company.',
  'litigation.judgment': 'A court judgment or ruling was given in a case involving the company.',
  'litigation.class_action': 'A class or collective action was filed involving the company.',
  'procurement.tender_published': 'A public body published a tender relevant to the company.',
  'procurement.contract_awarded': 'The company won a public contract.',
  'procurement.contract_lost': 'The company lost a public contract it held or bid for.',
  'regulatory.investigation_opened': 'A regulator opened an investigation, inquiry or case involving the company or its market.',
  'regulatory.enforcement_decision': 'A regulator fined, sanctioned or took enforcement action against the company.',
  'regulatory.consultation_opened': 'A regulator or government opened a consultation affecting the company or its sector.',
  'legislation.draft_published': 'A draft law, proposed rule or regulation affecting the company or its sector was published.',
  'legislation.rule_published': 'A final law, rule or regulation affecting the company or its sector was published.',
  'employment.mass_layoff': 'The company announced collective redundancies, a WARN notice, a PSE or an ERE.',
  'capital.funding_round': 'The company raised equity or venture funding.',
  'people.senior_hire': 'The company hired a senior executive or general counsel.',
  'press.mention': 'The company was mentioned in the business press in a way that may matter legally.',
} as const;
export type SignalType = keyof typeof SIGNAL_TYPES;
export const SIGNAL_TYPE_LIST = Object.keys(SIGNAL_TYPES) as SignalType[];

/**
 * Directed company-to-company relationships. Direction convention: `from` acts on `to`.
 */
export const RELATIONSHIP_TYPES = {
  owns: 'from owns or controls to (parent to subsidiary)',
  lends_to: 'from lends to or holds security over to',
  supplies: 'from supplies goods or services to to',
  landlord_of: 'from is the landlord of to',
  operates_for: 'from runs an outsourced operation for to (logistics, facilities, staffing)',
  bidder_for: 'from is bidding for or in talks to buy to, or its assets',
  creditor_of: 'from is a creditor of to',
  competitor_of: 'from competes with to',
  contracted_by: 'from holds a public contract awarded by to',
  acquirer_of: 'from acquired or agreed to acquire to',
  litigant_against: 'from is in litigation against to',
} as const;
export type RelationshipType = keyof typeof RELATIONSHIP_TYPES;
export const RELATIONSHIP_TYPE_LIST = Object.keys(RELATIONSHIP_TYPES) as RelationshipType[];

export const IDENTIFIER_SCHEMES = [
  'uk_crn',
  'fr_siren',
  'es_nif',
  'us_cik',
  'us_ein',
  'us_uei',
  'lei',
  'duns',
  'other',
] as const;
export type IdentifierScheme = (typeof IDENTIFIER_SCHEMES)[number];

export const PERSON_ROLES = [
  'ceo',
  'md',
  'cfo',
  'fd',
  'gc',
  'coo',
  'chair',
  'director',
  'hr',
  'procurement',
  'officer',
  'administrator',
  'shareholder',
  'other',
] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const USER_ROLES = ['admin', 'bd', 'partner', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_RANK: Record<UserRole, number> = { viewer: 0, partner: 1, bd: 2, admin: 3 };

export const OPPORTUNITY_STATUSES = [
  'new',
  'shortlisted',
  'accepted',
  'dismissed',
  'contacted',
  'replied',
  'meeting',
  'pitched',
  'matter_opened',
  'won',
  'lost',
  'expired',
  'excluded',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const RELATIONSHIP_FLAGS = ['new', 'client_cross_sell', 'client_drifting', 'client_existing'] as const;
export type RelationshipFlag = (typeof RELATIONSHIP_FLAGS)[number];

export const APPROACH_STATUSES = [
  'pending_draft',
  'drafting',
  'pending_approval',
  'needs_recipient',
  'blocked',
  'approved',
  'sending',
  'sent',
  'replied',
  'rejected',
  'suppressed',
] as const;
export type ApproachStatus = (typeof APPROACH_STATUSES)[number];

export const FEEDBACK_KINDS = ['accept', 'dismiss', 'reply', 'meeting', 'pitched', 'matter_opened', 'won', 'lost'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const LANGUAGES = ['en', 'fr', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export function marketLanguage(market: string | null | undefined): Language {
  if (market === 'FR') return 'fr';
  if (market === 'ES') return 'es';
  return 'en';
}
