import { and, desc, eq, or } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  companies,
  firmPredictions,
  modelVersions,
  records,
  relationships,
  signals,
} from '../../db/schema';
import type { Practice } from '../../domain/taxonomy';
import type { FirmSettings, Playbook } from '../../db/schema';
import { clamp } from '../../lib/time';
import { CONTRACT_VERSION } from '../swarm/contracts';
import { runPredict } from '../swarm/router';

export async function predictCompanyForFirm(
  db: Database,
  input: {
    firmId: string;
    companyId: string;
    settings: FirmSettings | undefined;
    playbooks: Playbook[];
    asOf?: Date;
  },
) {
  const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
  if (!company) return [];
  const companySignals = await db
    .select()
    .from(signals)
    .where(or(eq(signals.subjectCompanyId, company.id), eq(signals.relatedCompanyId, company.id)))
    .orderBy(desc(signals.createdAt))
    .limit(50);
  const recordIds = [...new Set(companySignals.map((s) => s.recordId))];
  const recordRows = recordIds.length
    ? await db.select().from(records).where(or(...recordIds.map((id) => eq(records.id, id))))
    : [];
  const recordById = new Map(recordRows.map((r) => [r.id, r]));
  const relatedIds = [
    ...new Set(companySignals.map((s) => s.relatedCompanyId).filter((id): id is string => Boolean(id))),
  ];
  const relatedCompanies = relatedIds.length
    ? await db.select().from(companies).where(or(...relatedIds.map((id) => eq(companies.id, id))))
    : [];
  const relatedName = new Map(relatedCompanies.map((c) => [c.id, c.name]));

  const edges = await db
    .select()
    .from(relationships)
    .where(or(eq(relationships.fromCompanyId, company.id), eq(relationships.toCompanyId, company.id)));
  const edgeCompanyIds = [
    ...new Set(edges.flatMap((e) => [e.fromCompanyId, e.toCompanyId]).filter((id) => id !== company.id)),
  ];
  const edgeCompanies = edgeCompanyIds.length
    ? await db.select().from(companies).where(or(...edgeCompanyIds.map((id) => eq(companies.id, id))))
    : [];
  const nameById = new Map([[company.id, company.name], ...edgeCompanies.map((c) => [c.id, c.name] as const)]);

  const exposures = [];
  for (const edge of edges) {
    if (edge.toCompanyId === company.id && edge.type === 'creditor_of') {
      exposures.push({
        role: 'creditor',
        practice: 'insolvency' as Practice,
        eventCompanyName: nameById.get(edge.fromCompanyId) ?? 'related company',
        eventType: 'insolvency.proceedings_opened' as const,
      });
    }
    if (edge.fromCompanyId === company.id && edge.type === 'creditor_of') {
      exposures.push({
        role: 'creditor',
        practice: 'insolvency' as Practice,
        eventCompanyName: nameById.get(edge.toCompanyId) ?? 'related company',
        eventType: 'insolvency.proceedings_opened' as const,
      });
    }
    if (edge.fromCompanyId === company.id && edge.type === 'supplies') {
      exposures.push({
        role: 'supplier',
        practice: 'commercial' as Practice,
        eventCompanyName: nameById.get(edge.toCompanyId) ?? 'customer',
        eventType: 'insolvency.proceedings_opened' as const,
      });
    }
    if (edge.fromCompanyId === company.id && edge.type === 'landlord_of') {
      exposures.push({
        role: 'landlord',
        practice: 'real_estate' as Practice,
        eventCompanyName: nameById.get(edge.toCompanyId) ?? 'tenant',
        eventType: 'insolvency.proceedings_opened' as const,
      });
    }
    if (edge.fromCompanyId === company.id && edge.type === 'lends_to') {
      exposures.push({
        role: 'lender',
        practice: 'banking' as Practice,
        eventCompanyName: nameById.get(edge.toCompanyId) ?? 'borrower',
        eventType: 'insolvency.proceedings_opened' as const,
      });
    }
    if (edge.fromCompanyId === company.id && edge.type === 'bidder_for') {
      exposures.push({
        role: 'bidder',
        practice: 'mna' as Practice,
        eventCompanyName: nameById.get(edge.toCompanyId) ?? 'target',
        eventType: 'insolvency.business_sale' as const,
      });
    }
    if (edge.fromCompanyId === company.id && edge.type === 'operates_for') {
      exposures.push({
        role: 'operator',
        practice: 'employment' as Practice,
        eventCompanyName: nameById.get(edge.toCompanyId) ?? 'principal',
        eventType: 'insolvency.proceedings_opened' as const,
      });
    }
  }

  const predicted = await runPredict(
    db,
    {
      version: CONTRACT_VERSION,
      task: 'predict',
      asOf: (input.asOf ?? new Date()).toISOString(),
      company: {
        id: company.id,
        name: company.name,
        market: company.market,
        sector: company.sector,
        employeeCount: company.employeeCount,
        identifiers: company.identifiers,
      },
      signals: companySignals.map((s) => {
        const rec = recordById.get(s.recordId);
        return {
          id: s.id,
          type: s.type,
          publishedAt: rec?.publishedAt.toISOString() ?? s.createdAt.toISOString(),
          recordId: s.recordId,
          sourceId: rec?.sourceId ?? 'unknown',
          subjectCompanyId: s.subjectCompanyId,
          relatedCompanyId: s.relatedCompanyId,
          relatedCompanyName: s.relatedCompanyId ? (relatedName.get(s.relatedCompanyId) ?? null) : null,
          confidence: s.confidence,
          payload: s.payload,
        };
      }),
      relationships: edges.map((e) => ({
        type: e.type,
        fromCompanyId: e.fromCompanyId,
        toCompanyId: e.toCompanyId,
        fromName: nameById.get(e.fromCompanyId) ?? e.fromCompanyId,
        toName: nameById.get(e.toCompanyId) ?? e.toCompanyId,
        amount: e.amount ? Number(e.amount) : null,
      })),
      exposures,
    },
    input.firmId,
  );

  const [model] = await db
    .select()
    .from(modelVersions)
    .where(and(eq(modelVersions.firmId, input.firmId), eq(modelVersions.active, true)))
    .orderBy(desc(modelVersions.version))
    .limit(1);
  const weights = model?.weights ?? {};

  const saved = [];
  for (const score of predicted.scores) {
    const book = input.playbooks.find((p) => p.practice === score.practice && p.enabled);
    if (!book) continue;
    if (input.settings?.focus.practices?.length && !input.settings.focus.practices.includes(score.practice)) continue;
    if (input.settings?.focus.markets?.length && company.market && !input.settings.focus.markets.includes(company.market)) {
      continue;
    }
    if (book.config.thresholds.minEmployees && (company.employeeCount ?? 0) < book.config.thresholds.minEmployees) continue;
    if (book.config.thresholds.maxEmployees && (company.employeeCount ?? Infinity) > book.config.thresholds.maxEmployees) {
      continue;
    }

    let likelihood = score.likelihood;
    for (const [feature, weight] of Object.entries(weights)) {
      if (score.contributions.some((c) => c.feature === feature)) {
        likelihood = clamp(likelihood * (1 + weight * 0.15), 0, 0.99);
      }
    }
    for (const [signalType, multiplier] of Object.entries(book.config.signalWeights)) {
      if (score.contributions.some((c) => c.feature === `signal:${signalType}`)) {
        likelihood = clamp(likelihood * multiplier, 0, 0.99);
      }
    }
    if (likelihood < book.config.minLikelihood) continue;

    const windowMin = book.config.windowDays?.min ?? score.windowMinDays;
    const windowMax = book.config.windowDays?.max ?? score.windowMaxDays;

    const [row] = await db
      .insert(firmPredictions)
      .values({
        firmId: input.firmId,
        companyId: company.id,
        practice: score.practice,
        likelihood,
        confidence: likelihood >= 0.6 || score.evidence.length >= 2 ? 'high' : score.confidence,
        windowMinDays: windowMin,
        windowMaxDays: windowMax,
        rationale: score.rationale,
        evidence: score.evidence,
        contributions: score.contributions,
        modelVersion: model?.version ?? 1,
        predictedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [firmPredictions.firmId, firmPredictions.companyId, firmPredictions.practice],
        set: {
          likelihood,
          confidence: likelihood >= 0.6 || score.evidence.length >= 2 ? 'high' : score.confidence,
          windowMinDays: windowMin,
          windowMaxDays: windowMax,
          rationale: score.rationale,
          evidence: score.evidence,
          contributions: score.contributions,
          modelVersion: model?.version ?? 1,
          predictedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    saved.push(row);
  }
  return saved;
}
