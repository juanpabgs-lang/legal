import type { SignalType, SourceKind } from '../../../domain/taxonomy';
import type { Mention } from '../../../domain/types';
import type { DetectInput, DetectOutput } from '../contracts';
import { CONTRACT_VERSION } from '../contracts';

interface Rule {
  type: SignalType;
  kinds?: SourceKind[];
  pattern: RegExp;
  subjectRole?: string;
  relatedRole?: string;
  confidence: number;
}

const RULES: Rule[] = [
  {
    type: 'insolvency.proceedings_opened',
    pattern:
      /\b(administration|administrator appointed|chapter\s*11|chapter\s*7|winding[- ]up|liquidation judiciaire|redressement|sauvegarde|concurso|insolvency proceedings|entered administration|in bankruptcy)\b/i,
    confidence: 0.92,
  },
  {
    type: 'insolvency.petition_filed',
    pattern: /\b(winding[- ]up petition|bankruptcy petition|petition to wind)\b/i,
    confidence: 0.85,
  },
  {
    type: 'insolvency.creditor_named',
    pattern: /\b(unsecured creditor|named among .{0,40}creditor|statement of affairs|creditor list)\b/i,
    subjectRole: 'creditor',
    relatedRole: 'debtor',
    confidence: 0.88,
  },
  {
    type: 'insolvency.business_sale',
    pattern: /\b(pre-pack|sale of business|cession|plan de cesi[oó]n|going concern sale)\b/i,
    confidence: 0.8,
  },
  {
    type: 'finance.security_registered',
    pattern: /\b(charge|debenture|ucc[- ]?1|security over|pledge|hypothe|floating charge|fixed charge)\b/i,
    confidence: 0.86,
  },
  {
    type: 'finance.covenant_breach',
    pattern: /\b(forbearance|covenant (breach|waiver)|event of default|acceleration)\b/i,
    confidence: 0.84,
  },
  {
    type: 'finance.refinancing',
    pattern: /\b(refinanc|new (credit )?facilit|notes offering|bond issue)\b/i,
    confidence: 0.75,
  },
  {
    type: 'corporate.officer_change',
    pattern: /\b(appointed|resignation|director|administrateur|nombramiento|cese)\b/i,
    kinds: ['registry'],
    confidence: 0.7,
  },
  {
    type: 'corporate.capital_change',
    pattern: /\b(capital increase|aumento de capital|augmentation de capital|share issue)\b/i,
    confidence: 0.78,
  },
  {
    type: 'corporate.acquisition_announced',
    pattern: /\b(acquired|acquisition of|merger with|agreed to buy|takeover)\b/i,
    confidence: 0.8,
  },
  {
    type: 'corporate.acquisition_interest',
    pattern: /\b(bidding for|in talks to (buy|acquire)|approached about|sale process)\b/i,
    confidence: 0.72,
  },
  {
    type: 'litigation.claim_filed',
    pattern: /\b(complaint filed|claim form|lawsuit|class action)\b/i,
    kinds: ['court'],
    confidence: 0.8,
  },
  {
    type: 'procurement.contract_awarded',
    pattern: /\b(awarded|award notice|adjudicad|attributaire|contract award)\b/i,
    kinds: ['tender'],
    confidence: 0.86,
  },
  {
    type: 'procurement.tender_published',
    pattern: /\b(tender|call for (tenders|competition)|aviso de licitaci|avis d'appel)\b/i,
    kinds: ['tender'],
    confidence: 0.8,
  },
  {
    type: 'regulatory.investigation_opened',
    pattern: /\b(investigation|inquiry|opened a case|probe into|enqu[eê]te)\b/i,
    kinds: ['regulator'],
    confidence: 0.78,
  },
  {
    type: 'regulatory.consultation_opened',
    pattern: /\b(consultation|call for evidence|projet de|consulta p[uú]blica)\b/i,
    kinds: ['regulator', 'legislation'],
    confidence: 0.76,
  },
  {
    type: 'legislation.draft_published',
    pattern: /\b(proposed rule|draft (law|regulation|bill)|notice of proposed)\b/i,
    kinds: ['legislation'],
    confidence: 0.8,
  },
  {
    type: 'employment.mass_layoff',
    pattern: /\b(warn notice|collective redundanc|pse\b|ere\b|licenciement (collectif|economique))\b/i,
    confidence: 0.88,
  },
];

function haystack(input: DetectInput): string {
  return [input.record.title, input.record.summary ?? '', input.record.body ?? ''].join('\n');
}

function mentionByRole(mentions: Mention[], role?: string): Mention | undefined {
  if (!role) return mentions.find((m) => m.kind === 'company');
  const lower = role.toLowerCase();
  return mentions.find((m) => m.kind === 'company' && (m.role ?? '').toLowerCase().includes(lower));
}

export function detectSimulated(input: DetectInput): DetectOutput {
  const text = haystack(input);
  const mentions = input.record.extracted.mentions;
  const companies = mentions.filter((m) => m.kind === 'company');
  const signals: DetectOutput['signals'] = [];

  const hinted = input.record.extracted.attributes?.signalTypes;
  if (Array.isArray(hinted)) {
    for (const type of hinted as SignalType[]) {
      const subject = mentionByRole(companies, 'subject') ?? companies[0];
      if (!subject) continue;
      const related = companies.find((c) => c.ref !== subject.ref);
      signals.push({
        type,
        subjectRef: subject.ref,
        relatedRef: related?.ref,
        mentions,
        confidence: 0.95,
        payload: input.record.extracted.attributes ?? {},
        rationale: `Structured extraction on ${input.record.sourceName}`,
      });
    }
  }

  for (const rule of RULES) {
    if (rule.kinds && !rule.kinds.includes(input.record.kind)) continue;
    if (!rule.pattern.test(text)) continue;
    if (signals.some((s) => s.type === rule.type)) continue;
    const subject =
      mentionByRole(companies, rule.subjectRole) ??
      mentionByRole(companies, 'subject') ??
      companies[0];
    if (!subject) continue;
    const related =
      mentionByRole(companies, rule.relatedRole) ?? companies.find((c) => c.ref !== subject.ref);
    signals.push({
      type: rule.type,
      subjectRef: subject.ref,
      relatedRef: related?.ref,
      mentions: mentions.length ? mentions : [subject],
      confidence: rule.confidence,
      payload: {},
      rationale: `Matched ${rule.type} on ${input.record.sourceId}`,
    });
  }

  if (signals.length === 0 && companies.length) {
    signals.push({
      type: 'press.mention',
      subjectRef: companies[0].ref,
      mentions,
      confidence: 0.4,
      payload: {},
      rationale: 'Company mentioned; no stronger legal signal classified',
    });
  }

  return { version: CONTRACT_VERSION, task: 'detect', signals };
}
