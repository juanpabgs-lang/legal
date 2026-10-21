import { writeFile } from 'node:fs/promises';
import { getConfig, resetConfig } from './config';
import { getDb, closeDb } from './db/client';
import { migrate } from './db/migrate';
import { runDemoStoryline } from './modules/demo/storyline';
import { startMockDeepSwarm } from './modules/swarm/mock-server';
import { ingestSource } from './modules/sources/ingest';
import { seedSourceCatalog } from './modules/sources/seed-catalog';
import { SOURCE_CATALOG } from './modules/sources/catalog';
import { opportunities, approaches, outboxMessages, records, signals } from './db/schema';
import { createFirm } from './modules/firm/service';

const command = process.argv[2] ?? 'help';

async function main() {
  if (command === 'help') {
    console.log(`norfront cli
  db:migrate
  seed:demo
  mock:deepswarm [--port 4173]
  sources:smoke
  live-run
`);
    return;
  }
  if (command === 'db:migrate') {
    await migrate();
    console.log('migrated');
    return;
  }
  if (command === 'seed:demo') {
    await migrate();
    const world = await runDemoStoryline(getDb());
    console.log(JSON.stringify({ firmId: world.firm.id, records: world.records }, null, 2));
    return;
  }
  if (command === 'mock:deepswarm') {
    const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4173);
    const app = await startMockDeepSwarm(port);
    console.log(`mock Deep Swarm on :${port}`);
    await new Promise(() => app);
    return;
  }
  if (command === 'sources:smoke') {
    await migrate();
    await seedSourceCatalog(getDb());
    const results = [];
    for (const source of SOURCE_CATALOG.filter((s) => s.enabled && !s.requiresKey)) {
      try {
        const result = await ingestSource(getDb(), source.id, 2);
        results.push({ source: source.id, ok: true, ...result });
      } catch (err) {
        results.push({ source: source.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  if (command === 'live-run') {
    resetConfig({ ...process.env, MAIL_PROVIDER: 'test' });
    await migrate();
    await seedSourceCatalog(getDb());
    const db = getDb();
    await createFirm(db, {
      name: 'Live Run Firm',
      slug: `live-run-${Date.now()}`,
      admin: { email: `live-${Date.now()}@norfront.local`, name: 'Live Admin', password: 'live-run-admin' },
    }).catch(() => undefined);
    const ingest = [];
    for (const source of SOURCE_CATALOG.filter((s) => s.enabled && !s.requiresKey)) {
      try {
        ingest.push({ source: source.id, ...(await ingestSource(db, source.id, getConfig().INGEST_LOOKBACK_DAYS)) });
      } catch (err) {
        ingest.push({ source: source.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const recordCount = (await db.select().from(records)).length;
    const signalCount = (await db.select().from(signals)).length;
    const oppCount = (await db.select().from(opportunities)).length;
    const approachCount = (await db.select().from(approaches)).length;
    const sent = (await db.select().from(outboxMessages)).length;
    const report = { ingest, recordCount, signalCount, oppCount, approachCount, outbox: sent, mailProvider: 'test' };
    await writeFile('.live-run/report.json', JSON.stringify(report, null, 2)).catch(async () => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir('.live-run', { recursive: true });
      await writeFile('.live-run/report.json', JSON.stringify(report, null, 2));
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error(`Unknown command ${command}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (command !== 'mock:deepswarm') await closeDb();
  });
