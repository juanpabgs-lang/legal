import { PgBoss } from 'pg-boss';
import { getConfig } from '../config';
import { logger } from '../lib/logger';
import { QUEUES } from './queues';

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const cfg = getConfig();
  const instance = new PgBoss({
    connectionString: cfg.DATABASE_URL,
    schema: 'pgboss',
  });
  instance.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await instance.start();
  for (const name of Object.values(QUEUES)) {
    await instance.createQueue(name, {
      retryLimit: 4,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    });
  }
  boss = instance;
  return instance;
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: false, timeout: 5_000 });
  boss = undefined;
}

export async function enqueue<T extends object>(name: string, data: T, options?: { singletonKey?: string; startAfter?: number }): Promise<string | null> {
  const instance = await getBoss();
  return instance.send(name, data, {
    singletonKey: options?.singletonKey,
    startAfter: options?.startAfter,
    retryLimit: 4,
    retryBackoff: true,
    retryDelay: 15,
  });
}
