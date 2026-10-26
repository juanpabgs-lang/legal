import type { Practice } from '../../domain/taxonomy';
import type { PlaybookConfig } from '../../domain/types';

const base = (overrides: Partial<PlaybookConfig> & Pick<PlaybookConfig, 'description' | 'watches' | 'predicts' | 'outcomeSignals'>): PlaybookConfig => ({
  signalWeights: {},
  minLikelihood: 0.32,
  cascadeDepth: 1,
  firstNoteRoles: ['gc', 'md', 'cfo'],
  winDefinition: 'instruction',
  exclusions: { sectors: [], companyIds: [], markets: [] },
  thresholds: {},
  autoSend: { enabled: false, kinds: ['warm'], maxPerDay: 3 },
  excludeCompaniesInProceedings: false,
  ...overrides,
});

export const DEFAULT_PLAYBOOKS: Record<Practice, PlaybookConfig> = {
  insolvency: base({
    description:
      'Distress before the petition, creditors who need to protect a claim or stock, and directors who need advice on their duties.',
    watches: [
      'petitions, administrations, Chapter 11 filings, concursos and redressements',
      'new security, late accounts and major customers that fail',
    ],
    predicts: [
      'distress before the petition',
      'creditors who need to protect a claim or unpaid stock',
      'directors who need advice on their duties',
    ],
    windowDays: { min: 14, max: 28 },
    firstNoteRoles: ['cfo', 'fd', 'md', 'gc'],
    outcomeSignals: [
      'insolvency.proceedings_opened',
      'insolvency.petition_filed',
      'insolvency.creditor_named',
      'finance.security_registered',
    ],
    signalWeights: {
      'insolvency.proceedings_opened': 1.2,
      'insolvency.creditor_named': 1.3,
      'finance.security_registered': 1.1,
    },
    excludeCompaniesInProceedings: true,
  }),
  mna: base({
    description: 'Sale processes 6 to 18 months out, buyers about to move, bolt-on acquisitions and distressed asset sales.',
    watches: [
      'board appointments linked to private equity',
      'capital increases, share transfers, auditor and adviser changes',
      'CFO hires with exit experience, fund closes, rivals’ deals and merger-control filings',
    ],
    predicts: ['sale processes 6 to 18 months out', 'buyers about to move', 'bolt-on acquisitions and distressed asset sales'],
    windowDays: { min: 90, max: 540 },
    firstNoteRoles: ['ceo', 'md', 'chair', 'gc'],
    outcomeSignals: ['corporate.acquisition_announced', 'corporate.acquisition_interest', 'corporate.ownership_change'],
    minLikelihood: 0.4,
  }),
  banking: base({
    description: 'Refinancings, amend-and-extend deals, enforcement and lender-side mandates.',
    watches: [
      'charges and UCC filings',
      'covenant waivers and forbearance agreements disclosed in 8-Ks',
      'upcoming maturities',
    ],
    predicts: ['refinancings', 'amend-and-extend deals', 'enforcement and lender-side mandates'],
    windowDays: { min: 14, max: 28 },
    firstNoteRoles: ['cfo', 'fd', 'gc'],
    outcomeSignals: ['finance.security_registered', 'finance.covenant_breach', 'finance.refinancing'],
  }),
  disputes: base({
    description: 'Defendants before they are served, follow-on claimants and companies exposed to the same issue.',
    watches: ['new dockets, judgments, recalls, regulator findings', 'counterparties that become insolvent'],
    predicts: ['defendants before they are served', 'follow-on claimants', 'companies exposed to the same issue'],
    windowDays: { min: 1, max: 14 },
    firstNoteRoles: ['gc'],
    outcomeSignals: ['litigation.claim_filed', 'litigation.judgment', 'litigation.class_action'],
  }),
  employment: base({
    description: 'Consultations, staff transfers and executive exits.',
    watches: ['WARN notices and collective redundancy filings', 'site closures, outsourcing contracts won or lost', 'executive departures'],
    predicts: ['consultations', 'staff transfers', 'executive exits'],
    windowDays: { min: 7, max: 45 },
    firstNoteRoles: ['hr', 'gc', 'md'],
    outcomeSignals: ['employment.mass_layoff', 'corporate.officer_change'],
  }),
  real_estate: base({
    description: 'Landlords facing empty units, lease renegotiations and buyers of distressed portfolios.',
    watches: ['tenant insolvencies', 'store-closure programmes', 'charges over property companies and sale-and-leasebacks'],
    predicts: ['landlords facing empty units', 'lease renegotiations', 'buyers of distressed portfolios'],
    windowDays: { min: 7, max: 60 },
    firstNoteRoles: ['md', 'cfo', 'gc'],
    outcomeSignals: ['insolvency.proceedings_opened', 'corporate.restructuring_costs'],
  }),
  regulatory: base({
    description: 'Who is next in the same market and who a rule will hit before it takes effect.',
    watches: [
      'investigations opened by the SEC, FTC, FCA, CMA, AMF, Autorité de la concurrence, CNIL, CNMV and CNMC',
      'draft rules and consultations',
    ],
    predicts: ['who is next in the same market', 'who a rule will hit before it takes effect'],
    windowDays: { min: 14, max: 180 },
    firstNoteRoles: ['gc'],
    outcomeSignals: ['regulatory.investigation_opened', 'regulatory.enforcement_decision', 'legislation.rule_published'],
  }),
  procurement: base({
    description: 'Losing bidders who may challenge, winners who need subcontracts, and incumbents whose staff will transfer.',
    watches: ['tenders and awards on SAM.gov, Find a Tender, BOAMP and the Plataforma de Contratación'],
    predicts: ['losing bidders who may challenge', 'winners who need subcontracts', 'incumbents whose staff will transfer'],
    windowDays: { min: 1, max: 21 },
    firstNoteRoles: ['procurement', 'gc', 'md'],
    outcomeSignals: ['procurement.contract_awarded', 'procurement.contract_lost', 'procurement.tender_published'],
  }),
  commercial: base({
    description: 'Counterparties of a distressed customer: unpaid invoices, stock at risk and contracts that need rewriting.',
    watches: ['customer insolvencies', 'new security over stock and receivables', 'named claims in creditor lists'],
    predicts: ['advice on unpaid stock and invoices', 'payments at risk of clawback', 'renegotiation of supply terms'],
    windowDays: { min: 14, max: 28 },
    firstNoteRoles: ['md', 'cfo', 'gc'],
    outcomeSignals: ['insolvency.creditor_named', 'finance.security_registered', 'finance.material_agreement'],
  }),
};

export const DEFAULT_OUTREACH_RULES = [
  {
    market: 'GLOBAL' as const,
    kind: 'do_not_contact_conflicts',
    config: { blockConflicts: true, blockDoNotContact: true },
  },
  {
    market: 'GLOBAL' as const,
    kind: 'frequency_cap',
    config: { maxPerCompanyDays: 30, maxPerContactDays: 21 },
  },
  {
    market: 'GLOBAL' as const,
    kind: 'required_source',
    config: { requireCitation: true },
  },
  {
    market: 'UK' as const,
    kind: 'bar_solicitation',
    config: { noUnsolicitedColdToIndividuals: false, attachSource: true },
  },
  {
    market: 'US' as const,
    kind: 'bar_solicitation',
    config: { identifyAsAdvertising: true, attachSource: true },
  },
  {
    market: 'FR' as const,
    kind: 'bar_solicitation',
    config: { noColdSolicitation: true, warmOnly: true },
  },
  {
    market: 'ES' as const,
    kind: 'bar_solicitation',
    config: { attachSource: true },
  },
];
