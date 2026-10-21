import type { Practice, SignalType } from '../../../domain/taxonomy';
import { recencyDecay, clamp } from '../../../lib/time';
import { CONTRACT_VERSION, type PredictInput, type PredictOutput } from '../contracts';

const SOURCE_RELIABILITY: Record<string, number> = {
  'uk-gazette': 0.95,
  'us-edgar': 0.92,
  'us-courtlistener': 0.9,
  'fr-bodacc': 0.94,
  'es-borme': 0.9,
  'es-boe': 0.93,
  'uk-find-a-tender': 0.88,
  'fr-boamp': 0.88,
  'es-placsp': 0.86,
  'us-federal-register': 0.85,
  'uk-govuk': 0.84,
  'uk-fca': 0.86,
  'seed': 0.99,
};

const SIGNAL_WEIGHTS: Partial<Record<SignalType, Partial<Record<Practice, number>>>> = {
  'insolvency.proceedings_opened': { insolvency: 0.55, commercial: 0.2, banking: 0.2, real_estate: 0.15, employment: 0.1, mna: 0.12 },
  'insolvency.creditor_named': { insolvency: 0.42, commercial: 0.38, banking: 0.18 },
  'insolvency.petition_filed': { insolvency: 0.5, disputes: 0.15 },
  'insolvency.business_sale': { mna: 0.4, insolvency: 0.3 },
  'finance.security_registered': { banking: 0.62, insolvency: 0.28, commercial: 0.22 },
  'finance.covenant_breach': { banking: 0.48, insolvency: 0.25 },
  'finance.refinancing': { banking: 0.4 },
  'corporate.acquisition_announced': { mna: 0.5, regulatory: 0.15 },
  'corporate.acquisition_interest': { mna: 0.42 },
  'corporate.officer_change': { employment: 0.15, mna: 0.12 },
  'corporate.capital_change': { mna: 0.22, banking: 0.1 },
  'litigation.claim_filed': { disputes: 0.5 },
  'litigation.judgment': { disputes: 0.35 },
  'procurement.contract_awarded': { procurement: 0.4, employment: 0.12 },
  'procurement.contract_lost': { procurement: 0.38, employment: 0.15, disputes: 0.12 },
  'regulatory.investigation_opened': { regulatory: 0.48, disputes: 0.15 },
  'regulatory.consultation_opened': { regulatory: 0.32 },
  'legislation.draft_published': { regulatory: 0.3 },
  'employment.mass_layoff': { employment: 0.5, insolvency: 0.12 },
};

const EXPOSURE_WEIGHTS: Record<string, Partial<Record<Practice, number>>> = {
  creditor: { insolvency: 0.85, commercial: 0.28 },
  supplier: { commercial: 0.7, insolvency: 0.28 },
  landlord: { real_estate: 0.85, insolvency: 0.12 },
  lender: { banking: 0.85, insolvency: 0.15 },
  bidder: { mna: 0.8 },
  operator: { employment: 0.8, commercial: 0.12 },
  competitor: { mna: 0.22, regulatory: 0.15 },
};

const WINDOWS: Record<Practice, { min: number; max: number }> = {
  insolvency: { min: 14, max: 28 },
  commercial: { min: 14, max: 28 },
  banking: { min: 14, max: 28 },
  disputes: { min: 1, max: 14 },
  employment: { min: 7, max: 30 },
  real_estate: { min: 14, max: 45 },
  mna: { min: 90, max: 360 },
  regulatory: { min: 21, max: 120 },
  procurement: { min: 3, max: 21 },
};

export function predictSimulated(input: PredictInput): PredictOutput {
  const now = new Date(input.asOf);
  const totals = new Map<Practice, { score: number; evidence: PredictOutput['scores'][number]['evidence']; contributions: PredictOutput['scores'][number]['contributions'] }>();

  const bump = (practice: Practice, amount: number, feature: string, evidenceNote: string, signalId?: string, recordId?: string) => {
    const current = totals.get(practice) ?? { score: 0, evidence: [], contributions: [] };
    current.score += amount;
    current.contributions.push({ feature, value: 1, weight: amount, contribution: amount });
    if (evidenceNote) current.evidence.push({ signalId, recordId, weight: amount, note: evidenceNote });
    totals.set(practice, current);
  };

  for (const signal of input.signals) {
    const weights = SIGNAL_WEIGHTS[signal.type];
    if (!weights) continue;
    const published = new Date(signal.publishedAt);
    const decay = recencyDecay(published, now, 21);
    const reliability = SOURCE_RELIABILITY[signal.sourceId] ?? 0.7;
    const scale = decay * reliability * (0.7 + 0.3 * signal.confidence);
    for (const [practice, weight] of Object.entries(weights) as Array<[Practice, number]>) {
      bump(
        practice,
        weight * scale,
        `signal:${signal.type}`,
        `${signal.type} (${signal.sourceId})`,
        signal.id,
        signal.recordId,
      );
    }
  }

  for (const exposure of input.exposures) {
    const weights = EXPOSURE_WEIGHTS[exposure.role] ?? { [exposure.practice]: 0.25 };
    for (const [practice, weight] of Object.entries(weights) as Array<[Practice, number]>) {
      bump(
        practice,
        weight,
        `exposure:${exposure.role}`,
        `${exposure.role} of ${exposure.eventCompanyName} (${exposure.eventType})`,
      );
    }
  }

  const scores: PredictOutput['scores'] = [];
  for (const [practice, agg] of totals) {
    const likelihood = clamp(1 - Math.exp(-agg.score * 1.15), 0, 0.99);
    if (likelihood < 0.2) continue;
    const window = WINDOWS[practice];
    const confidence = likelihood >= 0.6 || agg.evidence.length >= 2 ? 'high' : likelihood >= 0.45 ? 'medium' : 'low';
    scores.push({
      practice,
      likelihood: Number(likelihood.toFixed(3)),
      confidence,
      windowMinDays: window.min,
      windowMaxDays: window.max,
      rationale: agg.evidence.map((e) => e.note).slice(0, 4).join('; '),
      evidence: agg.evidence,
      contributions: agg.contributions,
    });
  }

  scores.sort((a, b) => b.likelihood - a.likelihood);
  return { version: CONTRACT_VERSION, task: 'predict', scores };
}
