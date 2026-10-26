import { getDb } from './db/client';
import { migrate } from './db/migrate';
import { getBoss } from './jobs/boss';
import { registerSchedules, registerWorkers } from './jobs/handlers';
import { logger } from './lib/logger';
import { seedSourceCatalog } from './modules/sources/seed-catalog';

async function main() {
  await migrate();
  await seedSourceCatalog(getDb());
  const boss = await getBoss();
  await registerWorkers(boss);
  await registerSchedules(boss);
  logger.info('Norfront worker listening');
}

main().catch((err) => {
  logger.error({ err }, 'failed to start worker');
  process.exit(1);
});
