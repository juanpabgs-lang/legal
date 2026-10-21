import { getConfig, resetConfig } from '../../src/config';
import { closeDb, getDb, getPool, resetDbHandles } from '../../src/db/client';
import { resetPublicSchema } from '../../src/db/migrate';

export async function setupTestDb() {
  resetConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://norfront:norfront@localhost:5432/norfront_test',
    JWT_SECRET: 'test-jwt-secret-123456',
    LOG_LEVEL: 'error',
    MAIL_PROVIDER: 'test',
    SWARM_DETECT: 'simulated',
    SWARM_PREDICT: 'simulated',
    SWARM_DRAFT: 'simulated',
  });
  resetDbHandles();
  const db = getDb(getConfig().DATABASE_URL);
  await resetPublicSchema(getPool());
  return db;
}

export async function teardownTestDb() {
  await closeDb();
}
