import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approaches, companies, modelVersions, opportunities, outboxMessages, routes } from '../../src/db/schema';
import { runDemoStoryline } from '../../src/modules/demo/storyline';
import { decideOpportunity } from '../../src/modules/opportunities/service';
import { approveAndSend, markReply } from '../../src/modules/outreach/service';
import { buildScorecard, startPilot } from '../../src/modules/pilot/service';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import type { Database } from '../../src/db/client';

describe('example-card storyline', () => {
  let db: Database;
  let world: Awaited<ReturnType<typeof runDemoStoryline>>;

  beforeAll(async () => {
    db = await setupTestDb();
    world = await runDemoStoryline(db);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('scores the distributor for insolvency, commercial and banking in a 2-4 week window', async () => {
    const rows = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.firmId, world.firm.id), eq(opportunities.companyId, world.companies.northbridge)));
    const practices = [...new Set(rows.map((r) => r.practice))];
    expect(practices).toEqual(expect.arrayContaining(['insolvency', 'commercial', 'banking']));
    for (const practice of ['insolvency', 'commercial', 'banking'] as const) {
      const row = rows
        .filter((r) => r.practice === practice)
        .sort((a, b) => b.likelihood - a.likelihood)[0];
      expect(row.confidence).toBe('high');
      expect(row.windowMinDays).toBe(14);
      expect(row.windowMaxDays).toBe(28);
    }
  });

  it('creates 24 more cascade opportunities across five practices', async () => {
    const rows = await db.select().from(opportunities).where(eq(opportunities.firmId, world.firm.id));
    const cascade = rows.filter((r) => r.companyId !== world.companies.northbridge && r.status !== 'excluded');
    const byPractice = {
      insolvency: cascade.filter((r) => r.practice === 'insolvency').length,
      real_estate: cascade.filter((r) => r.practice === 'real_estate').length,
      banking: cascade.filter((r) => r.practice === 'banking').length,
      mna: cascade.filter((r) => r.practice === 'mna').length,
      employment: cascade.filter((r) => r.practice === 'employment').length,
    };
    expect(byPractice.insolvency).toBeGreaterThanOrEqual(19);
    expect(byPractice.real_estate).toBe(2);
    expect(byPractice.banking).toBeGreaterThanOrEqual(1);
    expect(byPractice.mna).toBeGreaterThanOrEqual(1);
    expect(byPractice.employment).toBeGreaterThanOrEqual(1);
    expect(cascade.length).toBeGreaterThanOrEqual(24);
  });

  it('routes the distributor to the commercial partner with 9 exchanges', async () => {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.firmId, world.firm.id), eq(opportunities.companyId, world.companies.northbridge), eq(opportunities.practice, 'commercial')));
    expect(opp.assignedPartnerId).toBe(world.partner.id);
    const [route] = await db.select().from(routes).where(eq(routes.opportunityId, opp.id));
    expect(route.kind).toBe('warm');
    expect(route.interactions12m).toBe(9);
  });

  it('drafts, approves, sends to the test outbox, records a reply and updates the model', async () => {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.firmId, world.firm.id), eq(opportunities.companyId, world.companies.northbridge), eq(opportunities.practice, 'commercial')));
    await decideOpportunity(db, { firmId: world.firm.id, userId: world.admin.id, opportunityId: opp.id, kind: 'accept' });
    const [approach] = await db.select().from(approaches).where(eq(approaches.opportunityId, opp.id));
    const sent = await approveAndSend(db, { firmId: world.firm.id, approachId: approach.id, userId: world.admin.id });
    expect(sent.provider).toBe('test');
    const outbox = await db.select().from(outboxMessages).where(eq(outboxMessages.firmId, world.firm.id));
    expect(outbox.length).toBeGreaterThan(0);
    await markReply(db, { firmId: world.firm.id, userId: world.admin.id, approachId: approach.id, body: 'Call me Thursday.' });
    const versions = await db.select().from(modelVersions).where(eq(modelVersions.firmId, world.firm.id));
    expect(versions.length).toBeGreaterThan(1);
    const [company] = await db.select().from(companies).where(eq(companies.id, world.companies.northbridge));
    expect(company.name).toContain('Northbridge');
  });

  it('builds a week-8 scorecard with partner credit', async () => {
    const pilot = await startPilot(db, { firmId: world.firm.id, name: 'Founding pilot', practices: ['insolvency', 'commercial', 'banking'] });
    const card = await buildScorecard(db, world.firm.id, pilot.id);
    const payload = card.payload as { byPartner: Array<{ partnerId: string; sent: number }>; messages: number };
    expect(payload.messages).toBeGreaterThan(0);
    expect(payload.byPartner.some((p) => p.partnerId === world.partner.id)).toBe(true);
  });
});
