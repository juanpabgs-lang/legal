import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { sources } from '../../db/schema';
import { SOURCE_CATALOG } from './catalog';

export async function seedSourceCatalog(db: Database): Promise<void> {
  for (const source of SOURCE_CATALOG) {
    const [existing] = await db.select().from(sources).where(eq(sources.id, source.id));
    if (existing) {
      await db
        .update(sources)
        .set({
          name: source.name,
          market: source.market,
          kind: source.kind,
          connector: source.connector,
          requiresKey: source.requiresKey,
          cron: source.cron,
          rateLimitPerMinute: source.rateLimitPerMinute,
          homeUrl: source.homeUrl,
          updatedAt: new Date(),
        })
        .where(eq(sources.id, source.id));
    } else {
      await db.insert(sources).values(source);
    }
  }
}
