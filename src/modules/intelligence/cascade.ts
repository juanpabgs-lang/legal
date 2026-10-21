import type { Practice, RelationshipType, SignalType } from '../../domain/taxonomy';
import type { RelationshipEdge } from '../../domain/types';

export interface CascadeHit {
  companyId: string;
  practice: Practice;
  role: string;
  viaType: RelationshipType;
  eventCompanyId: string;
}

interface Rule {
  event: SignalType;
  incoming?: RelationshipType;
  outgoing?: RelationshipType;
  role: string;
  practices: Practice[];
}

const RULES: Rule[] = [
  { event: 'insolvency.proceedings_opened', incoming: 'creditor_of', role: 'creditor', practices: ['insolvency'] },
  { event: 'insolvency.proceedings_opened', incoming: 'supplies', role: 'supplier', practices: ['commercial', 'insolvency'] },
  { event: 'insolvency.proceedings_opened', incoming: 'landlord_of', role: 'landlord', practices: ['real_estate'] },
  { event: 'insolvency.proceedings_opened', incoming: 'lends_to', role: 'lender', practices: ['banking'] },
  { event: 'insolvency.proceedings_opened', incoming: 'bidder_for', role: 'bidder', practices: ['mna'] },
  { event: 'insolvency.proceedings_opened', incoming: 'operates_for', role: 'operator', practices: ['employment'] },
  { event: 'insolvency.business_sale', incoming: 'bidder_for', role: 'bidder', practices: ['mna'] },
  { event: 'procurement.contract_awarded', outgoing: 'supplies', role: 'subcontractor', practices: ['procurement', 'employment'] },
  { event: 'regulatory.investigation_opened', incoming: 'competitor_of', role: 'competitor', practices: ['regulatory'] },
  { event: 'employment.mass_layoff', incoming: 'operates_for', role: 'operator', practices: ['employment'] },
];

export function cascadeFromEvent(
  eventType: SignalType,
  eventCompanyId: string,
  edges: RelationshipEdge[],
  depth = 1,
): CascadeHit[] {
  if (depth < 1) return [];
  const hits: CascadeHit[] = [];
  for (const rule of RULES.filter((r) => r.event === eventType)) {
    for (const edge of edges) {
      if (rule.incoming && edge.type === rule.incoming && edge.toCompanyId === eventCompanyId) {
        for (const practice of rule.practices) {
          hits.push({
            companyId: edge.fromCompanyId,
            practice,
            role: rule.role,
            viaType: edge.type,
            eventCompanyId,
          });
        }
      }
      if (rule.outgoing && edge.type === rule.outgoing && edge.fromCompanyId === eventCompanyId) {
        for (const practice of rule.practices) {
          hits.push({
            companyId: edge.toCompanyId,
            practice,
            role: rule.role,
            viaType: edge.type,
            eventCompanyId,
          });
        }
      }
    }
  }
  return uniqueHits(hits);
}

function uniqueHits(hits: CascadeHit[]): CascadeHit[] {
  const seen = new Set<string>();
  const out: CascadeHit[] = [];
  for (const hit of hits) {
    const key = `${hit.companyId}:${hit.practice}:${hit.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}
