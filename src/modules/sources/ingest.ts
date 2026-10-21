import { eq } from 'drizzle-orm';
import { getConfig } from '../../config';
import type { Database } from '../../db/client';
import { records, sourceCursors, sources } from '../../db/schema';
import { emitActivity } from '../activity/service';
import { enqueue } from '../../jobs/boss';
import { QUEUES } from '../../jobs/queues';
import { getConnector } from './connectors';

export async function ingestSource(db: Database, sourceId: string, lookbackDays?: number) {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) return { fetched: 0, inserted: 0 };
  if (!source.enabled) return { fetched: 0, inserted: 0 };
  const connector = getConnector(source.connector, source);
  if (!connector) return { fetched: 0, inserted: 0, skipped: source.connector };
  const [cursorRow] = await db.select().from(sourceCursors).where(eq(sourceCursors.sourceId, sourceId));
  const cfg = getConfig();
  try {
    const result = await connector.fetch({
      lookbackDays: lookbackDays ?? cfg.INGEST_LOOKBACK_DAYS,
      cursor: cursorRow?.cursor ?? {},
      userAgent: cfg.USER_AGENT,
    });
    let inserted = 0;
    for (const rec of result.records) {
      const [row] = await db
        .insert(records)
        .values({
          sourceId,
          externalId: rec.externalId,
          publishedAt: rec.publishedAt,
          title: rec.title,
          summary: rec.summary ?? null,
          body: rec.body ?? null,
          url: rec.url ?? null,
          language: rec.language ?? (source.market === 'FR' ? 'fr' : source.market === 'ES' ? 'es' : 'en'),
          market: rec.market,
          kind: rec.kind,
          raw: rec.raw,
          extracted: rec.extracted ?? { mentions: [] },
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        inserted += 1;
        if (cfg.NODE_ENV !== 'test') {
          await enqueue(QUEUES.processRecord, { recordId: row.id }, { singletonKey: row.id });
        }
      }
    }
    await db
      .insert(sourceCursors)
      .values({
        sourceId,
        cursor: result.cursor,
        lastSuccessAt: new Date(),
        lastError: null,
        lastFetchedCount: result.records.length,
      })
      .onConflictDoUpdate({
        target: [sourceCursors.sourceId],
        set: {
          cursor: result.cursor,
          lastSuccessAt: new Date(),
          lastError: null,
          lastFetchedCount: result.records.length,
          updatedAt: new Date(),
        },
      });
    await emitActivity(db, {
      kind: 'source.ingested',
      title: `Ingested ${source.name}`,
      detail: { sourceId, fetched: result.records.length, inserted },
    });
    return { fetched: result.records.length, inserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .insert(sourceCursors)
      .values({ sourceId, cursor: cursorRow?.cursor ?? {}, lastError: message })
      .onConflictDoUpdate({
        target: [sourceCursors.sourceId],
        set: { lastError: message, updatedAt: new Date() },
      });
    throw err;
  }
}
