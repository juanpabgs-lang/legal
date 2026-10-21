import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getConfig } from '../config';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let dbInstance: Database | undefined;

export function getPool(url?: string): pg.Pool {
  if (pool) return pool;
  const cfg = getConfig();
  pool = new pg.Pool({
    connectionString: url ?? cfg.DATABASE_URL,
    ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: cfg.NODE_ENV === 'test' ? 4 : 10,
  });
  return pool;
}

export function getDb(url?: string): Database {
  if (dbInstance) return dbInstance;
  dbInstance = drizzle(getPool(url), { schema });
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    dbInstance = undefined;
  }
}

export function resetDbHandles(): void {
  pool = undefined;
  dbInstance = undefined;
}

export { schema };
