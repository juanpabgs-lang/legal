import { getConfig } from './config';
import { getDb } from './db/client';
import { migrate } from './db/migrate';
import { buildApp } from './http/app';
import { logger } from './lib/logger';
import { seedSourceCatalog } from './modules/sources/seed-catalog';

async function main() {
  const cfg = getConfig();
  await migrate();
  await seedSourceCatalog(getDb());
  const app = await buildApp();
  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  logger.info({ port: cfg.PORT }, 'Norfront API listening');
}

main().catch((err) => {
  logger.error({ err }, 'failed to start API');
  process.exit(1);
});
