import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../../src/db/schema';
import { buildApp } from '../../src/http/app';
import { createFirm } from '../../src/modules/firm/service';
import { setupTestDb, teardownTestDb } from '../helpers/db';

describe('API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tokenA: string;
  let tokenB: string;
  let firmA: string;

  beforeAll(async () => {
    const db = await setupTestDb();
    const a = await createFirm(db, {
      name: 'Firm A',
      slug: 'firm-a',
      admin: { email: 'a@test.local', name: 'Ada', password: 'password-a1' },
    });
    const b = await createFirm(db, {
      name: 'Firm B',
      slug: 'firm-b',
      admin: { email: 'b@test.local', name: 'Bea', password: 'password-b1' },
    });
    firmA = a.firm.id;
    app = await buildApp();
    await app.ready();
    tokenA = (await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'a@test.local', password: 'password-a1' } })).json().token;
    tokenB = (await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'b@test.local', password: 'password-b1' } })).json().token;
    expect(a.firm.id).not.toBe(b.firm.id);
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDb();
  });

  it('rejects anonymous access', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/opportunities' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the caller firm only', async () => {
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${tokenA}` } });
    expect(me.json().firmId).toBe(firmA);
    const firm = await app.inject({ method: 'GET', url: '/v1/firm', headers: { authorization: `Bearer ${tokenA}` } });
    expect(firm.json().firm.slug).toBe('firm-a');
    const other = await app.inject({ method: 'GET', url: '/v1/firm', headers: { authorization: `Bearer ${tokenB}` } });
    expect(other.json().firm.slug).toBe('firm-b');
    expect(other.json().firm.id).not.toBe(firm.json().firm.id);
  });

  it('issues an API key and authenticates with it', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/auth/api-keys',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'ci' },
    });
    expect(created.statusCode).toBe(200);
    const key = created.json().key as string;
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${key}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('a@test.local');
  });

  it('does not leak users across firms', async () => {
    const db = (await import('../../src/db/client')).getDb();
    const all = await db.select().from(users);
    const aUsers = all.filter((u) => u.firmId === firmA);
    expect(aUsers.every((u) => u.email.endsWith('@test.local') || u.email === 'a@test.local')).toBe(true);
    expect(all.filter((u) => u.email === 'b@test.local')[0]?.firmId).not.toBe(firmA);
  });

  it('updates dials', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/firm/settings',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { volume: 'balanced', reach: 'warm_and_cold' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().volume).toBe('balanced');
  });
});
