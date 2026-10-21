import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getPool } from './client';

const here = dirname(fileURLToPath(import.meta.url));

function migrationPath(): string {
  const candidates = [
    join(process.cwd(), 'drizzle/0000_init.sql'),
    join(here, '../../drizzle/0000_init.sql'),
    join(here, '../drizzle/0000_init.sql'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not find drizzle/0000_init.sql (looked in ${candidates.join(', ')})`);
  return found;
}

export async function migrate(pool?: pg.Pool): Promise<void> {
  const client = pool ?? getPool();
  const existing = await client.query<{ r: string | null }>('select to_regclass(\'public.firms\') as r');
  if (existing.rows[0]?.r) return;
  const sql = await readFile(migrationPath(), 'utf8');
  await client.query(sql);
}

export async function resetPublicSchema(pool?: pg.Pool): Promise<void> {
  const client = pool ?? getPool();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  const sql = await readFile(migrationPath(), 'utf8');
  await client.query(sql);
}
