import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  clientRelationships,
  companies,
  firmPredictions,
  firmSettings,
  opportunities,
  opportunitySignals,
  playbooks,
  signals,
} from '../../db/schema';
import type { OpportunityStatus, Practice } from '../../domain/taxonomy';
import type { CascadeHit } from '../intelligence/cascade';
import { routeOpportunity } from '../routing/service';
import { ensureApproach } from '../outreach/service';
import { applyFeedback } from '../learning/service';
import { badRequest, notFound } from '../../lib/errors';

const TERMINAL: OpportunityStatus[] = ['dismissed', 'won', 'lost', 'expired', 'excluded', 'matter_opened'];

export async function upsertOpportunitiesForFirm(
  db: Database,
  input: {
    firmId: string;
    companyIds: string[];
    cascadeHits: Array<CascadeHit & { eventType?: string; eventRecordId: string; eventCompanyId: string }>;
    eventRecordId: string;
  },
) {
  if (!input.companyIds.length) return [];
  const [settings] = await db.select().from(firmSettings).where(eq(firmSettings.firmId, input.firmId));
  const books = await db.select().from(playbooks).where(eq(playbooks.firmId, input.firmId));
  const preds = await db
    .select()
    .from(firmPredictions)
    .where(and(eq(firmPredictions.firmId, input.firmId), inArray(firmPredictions.companyId, input.companyIds)));
  const rels = await db.select().from(clientRelationships).where(eq(clientRelationships.firmId, input.firmId));
  const created = [];

  const synthesized = await predictionsFromCascade(db, input.firmId, input.cascadeHits, preds);
  const allPreds = [...preds, ...synthesized];

  for (const pred of allPreds) {
    const book = books.find((b) => b.practice === pred.practice);
    if (!book?.enabled) continue;
    const rel = rels.find((r) => r.companyId === pred.companyId);
    if (rel?.status === 'conflict' || rel?.status === 'do_not_contact') {
      await upsertOpp(db, {
        firmId: input.firmId,
        companyId: pred.companyId,
        practice: pred.practice,
        predictionId: pred.id,
        eventRecordId: input.eventRecordId,
        status: 'excluded',
        relationshipFlag: 'new',
        likelihood: pred.likelihood,
        confidence: pred.confidence,
        windowMinDays: pred.windowMinDays,
        windowMaxDays: pred.windowMaxDays,
        rationale: pred.rationale,
      });
      continue;
    }
    const hit = input.cascadeHits.find((h) => h.companyId === pred.companyId && h.practice === pred.practice);
    const flag =
      rel?.status === 'client'
        ? rel.practices.includes(pred.practice)
          ? daysSince(rel.lastMatterAt) > 180
            ? 'client_drifting'
            : 'client_existing'
          : 'client_cross_sell'
        : 'new';

    const row = await upsertOpp(db, {
      firmId: input.firmId,
      companyId: pred.companyId,
      practice: pred.practice,
      predictionId: pred.id,
      eventRecordId: hit?.eventCompanyId ? input.eventRecordId : input.eventRecordId,
      cascadeFrom: Boolean(hit),
      exposureRole: hit?.role ?? null,
      status: 'new',
      relationshipFlag: flag,
      likelihood: pred.likelihood,
      confidence: pred.confidence,
      windowMinDays: pred.windowMinDays,
      windowMaxDays: pred.windowMaxDays,
      rationale: pred.rationale,
    });
    created.push(row);
    const linked = await db
      .select()
      .from(signals)
      .where(eq(signals.subjectCompanyId, pred.companyId));
    if (linked.length) {
      await db
        .insert(opportunitySignals)
        .values(linked.map((s) => ({ opportunityId: row.id, signalId: s.id })))
        .onConflictDoNothing();
    }
  }

  await shortlistFirm(db, input.firmId, settings?.volume ?? 'focused', settings?.weeklyShortlistSize ?? 15);
  const shortlisted = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.firmId, input.firmId), eq(opportunities.status, 'shortlisted')));
  for (const opp of shortlisted) {
    await routeOpportunity(db, opp.id);
    await ensureApproach(db, opp.id, settings?.reach ?? 'warm', settings?.autonomy ?? 'approve');
  }
  return created;
}

async function predictionsFromCascade(
  db: Database,
  firmId: string,
  hits: Array<CascadeHit & { eventType?: string; eventRecordId: string; eventCompanyId: string }>,
  existing: Array<{ companyId: string; practice: Practice }>,
) {
  const books = await db.select().from(playbooks).where(eq(playbooks.firmId, firmId));
  const created = [];
  for (const hit of hits) {
    if (existing.some((p) => p.companyId === hit.companyId && p.practice === hit.practice)) continue;
    const book = books.find((b) => b.practice === hit.practice && b.enabled);
    if (!book) continue;
    const [row] = await db
      .insert(firmPredictions)
      .values({
        firmId,
        companyId: hit.companyId,
        practice: hit.practice,
        likelihood: 0.68,
        confidence: 'high',
        windowMinDays: book.config.windowDays?.min ?? 14,
        windowMaxDays: book.config.windowDays?.max ?? 28,
        rationale: `${hit.role} of a related company (${hit.viaType})`,
        evidence: [{ note: `cascade:${hit.role}` }],
        contributions: [{ feature: `exposure:${hit.role}`, value: 1, weight: 0.68, contribution: 0.68 }],
        modelVersion: 1,
      })
      .onConflictDoUpdate({
        target: [firmPredictions.firmId, firmPredictions.companyId, firmPredictions.practice],
        set: { likelihood: 0.68, rationale: `${hit.role} of a related company (${hit.viaType})`, updatedAt: new Date() },
      })
      .returning();
    created.push(row);
  }
  return created;
}

async function upsertOpp(
  db: Database,
  input: {
    firmId: string;
    companyId: string;
    practice: Practice;
    predictionId: string;
    eventRecordId: string;
    cascadeFrom?: boolean;
    exposureRole?: string | null;
    status: OpportunityStatus;
    relationshipFlag: 'new' | 'client_cross_sell' | 'client_drifting' | 'client_existing';
    likelihood: number;
    confidence: 'low' | 'medium' | 'high';
    windowMinDays: number;
    windowMaxDays: number;
    rationale: string | null;
  },
) {
  const [existing] = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.firmId, input.firmId),
        eq(opportunities.companyId, input.companyId),
        eq(opportunities.practice, input.practice),
        eq(opportunities.eventRecordId, input.eventRecordId),
      ),
    );
  if (existing) {
    if (TERMINAL.includes(existing.status)) return existing;
    const [updated] = await db
      .update(opportunities)
      .set({
        predictionId: input.predictionId,
        likelihood: input.likelihood,
        confidence: input.likelihood >= 0.6 ? 'high' : input.confidence,
        windowMinDays: input.windowMinDays,
        windowMaxDays: input.windowMaxDays,
        rationale: input.rationale,
        exposureRole: input.exposureRole ?? existing.exposureRole,
        relationshipFlag: input.relationshipFlag,
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(opportunities)
    .values({
      firmId: input.firmId,
      companyId: input.companyId,
      practice: input.practice,
      predictionId: input.predictionId,
      eventRecordId: input.eventRecordId,
      exposureRole: input.exposureRole,
      status: input.status,
      relationshipFlag: input.relationshipFlag,
      likelihood: input.likelihood,
      confidence: input.likelihood >= 0.6 ? 'high' : input.confidence,
      windowMinDays: input.windowMinDays,
      windowMaxDays: input.windowMaxDays,
      rationale: input.rationale,
    })
    .returning();
  return created;
}

export async function shortlistFirm(db: Database, firmId: string, volume: 'focused' | 'balanced' | 'all', size: number) {
  const cap = volume === 'all' ? 500 : volume === 'balanced' ? size * 2 : size;
  const rows = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.firmId, firmId), inArray(opportunities.status, ['new', 'shortlisted'])))
    .orderBy(desc(opportunities.likelihood));
  for (const [index, row] of rows.entries()) {
    const next = index < cap ? 'shortlisted' : 'new';
    if (row.status !== next) {
      await db
        .update(opportunities)
        .set({
          status: next,
          shortlistedAt: next === 'shortlisted' ? new Date() : row.shortlistedAt,
          updatedAt: new Date(),
        })
        .where(eq(opportunities.id, row.id));
    }
  }
}

export async function listOpportunities(
  db: Database,
  firmId: string,
  query: { status?: OpportunityStatus; practice?: Practice; partnerId?: string; limit?: number },
) {
  const rows = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.firmId, firmId))
    .orderBy(desc(opportunities.likelihood))
    .limit(query.limit ?? 50);
  return rows.filter((row) => {
    if (query.status && row.status !== query.status) return false;
    if (query.practice && row.practice !== query.practice) return false;
    if (query.partnerId && row.assignedPartnerId !== query.partnerId) return false;
    return true;
  });
}

export async function getOpportunity(db: Database, firmId: string, id: string) {
  const [row] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.firmId, firmId)));
  if (!row) throw notFound('Opportunity');
  const [company] = await db.select().from(companies).where(eq(companies.id, row.companyId));
  return { ...row, company };
}

export async function decideOpportunity(
  db: Database,
  input: { firmId: string; userId: string; opportunityId: string; kind: 'accept' | 'dismiss'; reason?: string },
) {
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.firmId, input.firmId)));
  if (!opp) throw notFound('Opportunity');
  if (TERMINAL.includes(opp.status) && opp.status !== 'dismissed') throw badRequest('Opportunity is closed');
  const status = input.kind === 'accept' ? 'accepted' : 'dismissed';
  const [updated] = await db
    .update(opportunities)
    .set({ status, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(opportunities.id, opp.id))
    .returning();
  await applyFeedback(db, {
    firmId: input.firmId,
    userId: input.userId,
    opportunityId: opp.id,
    kind: input.kind,
    reason: input.reason,
  });
  return updated;
}

function daysSince(value: Date | null): number {
  if (!value) return 999;
  return Math.round((Date.now() - value.getTime()) / 86_400_000);
}
