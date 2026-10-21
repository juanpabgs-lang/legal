import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  companies,
  firmSettings,
  firms,
  playbooks,
  records,
  relationships,
  signals,
  sources,
} from '../../db/schema';
import type { Practice, RelationshipType, SignalType } from '../../domain/taxonomy';
import type { Mention } from '../../domain/types';
import { emitActivity } from '../activity/service';
import { cascadeFromEvent } from '../intelligence/cascade';
import { upsertRelationship } from '../intelligence/graph';
import { resolveMentions } from '../intelligence/resolver';
import { upsertOpportunitiesForFirm } from '../opportunities/service';
import { CONTRACT_VERSION } from '../swarm/contracts';
import { runDetect } from '../swarm/router';
import { predictCompanyForFirm } from '../intelligence/predict';

const EDGE_FROM_SIGNAL: Partial<Record<SignalType, RelationshipType>> = {
  'insolvency.creditor_named': 'creditor_of',
  'finance.security_registered': 'lends_to',
  'corporate.acquisition_interest': 'bidder_for',
  'corporate.acquisition_announced': 'acquirer_of',
  'procurement.contract_awarded': 'contracted_by',
};

export async function processRecord(db: Database, recordId: string): Promise<{ signalCount: number; companyIds: string[] }> {
  const [record] = await db.select().from(records).where(eq(records.id, recordId));
  if (!record) return { signalCount: 0, companyIds: [] };
  const [source] = await db.select().from(sources).where(eq(sources.id, record.sourceId));

  const detected = await runDetect(db, {
    version: CONTRACT_VERSION,
    task: 'detect',
    record: {
      id: record.id,
      sourceId: record.sourceId,
      sourceName: source?.name ?? record.sourceId,
      kind: record.kind,
      market: record.market,
      language: record.language,
      title: record.title,
      summary: record.summary,
      body: record.body,
      url: record.url,
      publishedAt: record.publishedAt.toISOString(),
      extracted: record.extracted,
    },
  });

  const mentionBag: Mention[] = [
    ...record.extracted.mentions,
    ...detected.signals.flatMap((s) => s.mentions),
  ];
  const uniqueMentions = dedupeMentions(mentionBag);
  const resolved = await resolveMentions(db, uniqueMentions);
  const refToCompany = new Map(resolved.filter((r) => r.companyId).map((r) => [r.mention.ref, r.companyId!]));

  const createdSignalIds: string[] = [];
  for (const signal of detected.signals) {
    const subjectId = refToCompany.get(signal.subjectRef) ?? null;
    const relatedId = signal.relatedRef ? (refToCompany.get(signal.relatedRef) ?? null) : null;
    const [row] = await db
      .insert(signals)
      .values({
        recordId: record.id,
        type: signal.type,
        subjectCompanyId: subjectId,
        relatedCompanyId: relatedId,
        mentions: signal.mentions,
        payload: { ...signal.payload, rationale: signal.rationale },
        confidence: signal.confidence,
      })
      .onConflictDoNothing()
      .returning();
    if (row) createdSignalIds.push(row.id);

    const edgeType = EDGE_FROM_SIGNAL[signal.type];
    if (edgeType && subjectId && relatedId) {
      if (signal.type === 'finance.security_registered') {
        await upsertRelationship(db, {
          fromCompanyId: relatedId,
          toCompanyId: subjectId,
          type: edgeType,
          evidenceRecordId: record.id,
        });
      } else if (signal.type === 'insolvency.creditor_named') {
        await upsertRelationship(db, {
          fromCompanyId: subjectId,
          toCompanyId: relatedId,
          type: edgeType,
          evidenceRecordId: record.id,
        });
      } else {
        await upsertRelationship(db, {
          fromCompanyId: subjectId,
          toCompanyId: relatedId,
          type: edgeType,
          evidenceRecordId: record.id,
        });
      }
    }
  }

  const allSignals = await db.select().from(signals).where(eq(signals.recordId, record.id));
  const companyIds = new Set<string>();
  for (const signal of allSignals) {
    if (signal.subjectCompanyId) companyIds.add(signal.subjectCompanyId);
    if (signal.relatedCompanyId) companyIds.add(signal.relatedCompanyId);
  }

  const edges = (await db.select().from(relationships)).map((e) => ({
    id: e.id,
    fromCompanyId: e.fromCompanyId,
    toCompanyId: e.toCompanyId,
    type: e.type,
    amount: e.amount ? Number(e.amount) : null,
    attributes: e.attributes,
  }));

  const cascadeHits = [];
  for (const signal of allSignals) {
    if (!signal.subjectCompanyId) continue;
    const hits = cascadeFromEvent(signal.type, signal.subjectCompanyId, edges, 1);
    cascadeHits.push(
      ...hits.map((h) => ({
        ...h,
        eventType: signal.type,
        eventRecordId: record.id,
        eventCompanyId: signal.subjectCompanyId!,
      })),
    );
    for (const hit of hits) companyIds.add(hit.companyId);
  }

  await db.update(records).set({ processedAt: new Date(), updatedAt: new Date() }).where(eq(records.id, recordId));

  const firmRows = await db.select().from(firms);
  for (const firm of firmRows) {
    const [settings] = await db.select().from(firmSettings).where(eq(firmSettings.firmId, firm.id));
    const books = await db.select().from(playbooks).where(eq(playbooks.firmId, firm.id));
    for (const companyId of companyIds) {
      await predictCompanyForFirm(db, {
        firmId: firm.id,
        companyId,
        settings,
        playbooks: books,
        asOf: record.publishedAt,
      });
    }
    await upsertOpportunitiesForFirm(db, {
      firmId: firm.id,
      companyIds: [...companyIds],
      cascadeHits,
      eventRecordId: record.id,
    });
  }

  await emitActivity(db, {
    kind: 'record.processed',
    title: `Processed ${record.title}`,
    detail: { recordId, signals: allSignals.length, companies: companyIds.size },
  });

  return { signalCount: allSignals.length, companyIds: [...companyIds] };
}

function dedupeMentions(mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const mention of mentions) {
    const key = `${mention.kind}:${mention.ref}:${mention.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mention);
  }
  return out;
}

export async function latestCompanySignals(db: Database, companyId: string, limit = 40) {
  return db
    .select()
    .from(signals)
    .where(eq(signals.subjectCompanyId, companyId))
    .orderBy(desc(signals.createdAt))
    .limit(limit);
}

export async function loadCompanies(db: Database, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(companies).where(inArray(companies.id, ids));
}

export async function signalsForCompanies(db: Database, companyIds: string[]) {
  if (!companyIds.length) return [];
  return db
    .select()
    .from(signals)
    .where(inArray(signals.subjectCompanyId, companyIds));
}

export function enabledPractices(books: Array<{ practice: Practice; enabled: boolean }>): Practice[] {
  return books.filter((b) => b.enabled).map((b) => b.practice);
}

export { and };
