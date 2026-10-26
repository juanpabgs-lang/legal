import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { records, sources } from '../../db/schema';
import type { Mention } from '../../domain/types';
import { addDays } from '../../lib/time';
import { createFirm, createPartner, importClients, importContacts, importInteractions } from '../firm/service';
import { upsertRelationship } from '../intelligence/graph';
import { resolveCompany, resolvePerson } from '../intelligence/resolver';
import { processRecord } from '../pipeline/process-record';
import { seedSourceCatalog } from '../sources/seed-catalog';

export const CREDITOR_NAMES = [
  'Ashford Packaging Ltd',
  'Bramley Coldstore Ltd',
  'Calder Ingredients Ltd',
  'Dunelm Labels Ltd',
  'Eastfield Produce Ltd',
  'Fenwick Dairy Ltd',
  'Greaves Bakery Supplies Ltd',
  'Hartley Oils Ltd',
  'Iona Fruit Importers Ltd',
  'Juniper Hygiene Ltd',
  'Kestrel Pallet Services Ltd',
  'Langham Meat Co Ltd',
  'Moss Energy Brokers Ltd',
  'Newark Film & Wrap Ltd',
  'Ottershaw Cleaning Ltd',
  'Pennine Glass Ltd',
  'Quince IT Services Ltd',
  'Redhills Insurance Brokers Ltd',
  'Selby Waste Ltd',
] as const;

export async function seedDemoWorld(db: Database, clock = new Date('2026-03-01T09:00:00Z')) {
  await seedSourceCatalog(db);
  await db.insert(sources).values({
    id: 'seed',
    name: 'Seeded public record',
    market: 'UK',
    kind: 'insolvency',
    connector: 'seed',
    enabled: false,
    requiresKey: false,
    cron: '0 0 1 1 *',
    rateLimitPerMinute: 1,
    homeUrl: 'https://norfront.local/seed',
  }).onConflictDoNothing();

  const { firm, admin } = await createFirm(db, {
    name: 'Legara',
    slug: 'legara',
    markets: ['UK'],
    admin: { email: 'bd@legara.test', name: 'Priya Shah', password: 'legara-admin' },
  });

  const { partner, user: partnerUser } = await createPartner(db, {
    firmId: firm.id,
    user: { email: 'james.ellison@legara.test', name: 'James Ellison', password: 'partner-pass-1' },
    practices: ['commercial', 'insolvency'],
    title: 'Partner, Commercial',
    voiceSample:
      'Helen, good to pick this up with you rather than a cold note. Worth 20 minutes this week? James Ellison',
    voiceNotes: 'Short sentences. First names. No Latin.',
    mailboxEmail: 'james.ellison@legara.test',
  });

  const northbridge = await resolveCompany(db, {
    name: 'Northbridge Foods Ltd',
    market: 'UK',
    identifiers: [{ scheme: 'uk_crn', value: '08123456' }],
  });
  await dbUpdateCompany(db, northbridge.id, { sector: 'food-distribution', employeeCount: 80, description: 'Regional food distributor' });

  const meridian = await resolveCompany(db, {
    name: 'Meridian Grocers plc',
    market: 'UK',
    identifiers: [{ scheme: 'uk_crn', value: '01299887' }],
  });
  await dbUpdateCompany(db, meridian.id, { sector: 'supermarkets', employeeCount: 14000 });

  const helen = await resolvePerson(
    db,
    { ref: 'helen', kind: 'person', name: 'Helen Cartwright', personRole: 'md', title: 'Managing Director', companyRef: 'northbridge' },
    northbridge.id,
  );

  const creditors = [];
  for (const name of CREDITOR_NAMES) {
    const company = await resolveCompany(db, { name, market: 'UK' });
    creditors.push(company);
    await upsertRelationship(db, { fromCompanyId: company.id, toCompanyId: meridian.id, type: 'creditor_of' });
  }

  await upsertRelationship(db, { fromCompanyId: northbridge.id, toCompanyId: meridian.id, type: 'creditor_of' });
  await upsertRelationship(db, { fromCompanyId: northbridge.id, toCompanyId: meridian.id, type: 'supplies' });

  const harbour = await resolveCompany(db, { name: 'Harbour Estates Ltd', market: 'UK' });
  const quay = await resolveCompany(db, { name: 'Quay Retail Properties Ltd', market: 'UK' });
  await upsertRelationship(db, { fromCompanyId: harbour.id, toCompanyId: meridian.id, type: 'landlord_of' });
  await upsertRelationship(db, { fromCompanyId: quay.id, toCompanyId: meridian.id, type: 'landlord_of' });

  const sterling = await resolveCompany(db, { name: 'Sterling Asset Finance plc', market: 'UK' });
  await upsertRelationship(db, { fromCompanyId: sterling.id, toCompanyId: meridian.id, type: 'lends_to' });

  const vale = await resolveCompany(db, { name: 'Vale Markets Ltd', market: 'UK' });
  await upsertRelationship(db, { fromCompanyId: vale.id, toCompanyId: meridian.id, type: 'bidder_for' });

  const apex = await resolveCompany(db, { name: 'Apex Logistics Ltd', market: 'UK' });
  await upsertRelationship(db, { fromCompanyId: apex.id, toCompanyId: meridian.id, type: 'operates_for' });

  const ridgeway = await resolveCompany(db, { name: 'Ridgeway Bank plc', market: 'UK' });

  await importContacts(db, firm.id, [
    {
      name: 'Helen Cartwright',
      email: 'helen.cartwright@northbridgefoods.test',
      role: 'md',
      title: 'Managing Director',
      companyName: 'Northbridge Foods Ltd',
      companyNumber: '08123456',
      market: 'UK',
    },
  ]);

  const interactions = Array.from({ length: 9 }, (_, i) => ({
    partnerEmail: 'james.ellison@legara.test',
    contactEmail: 'helen.cartwright@northbridgefoods.test',
    contactName: 'Helen Cartwright',
    companyName: 'Northbridge Foods Ltd',
    channel: 'email',
    direction: 'both' as const,
    occurredAt: addDays(clock, -30 + i * 3).toISOString(),
    count: 1,
  }));
  await importInteractions(db, firm.id, interactions);
  await importClients(db, firm.id, []);

  const records = await insertStorylineRecords(db, {
    clock,
    northbridgeName: 'Northbridge Foods Ltd',
    meridianName: 'Meridian Grocers plc',
    ridgewayName: 'Ridgeway Bank plc',
    creditorNames: [...CREDITOR_NAMES],
  });

  return {
    firm,
    admin,
    partner,
    partnerUser,
    companies: {
      northbridge: northbridge.id,
      meridian: meridian.id,
      harbour: harbour.id,
      quay: quay.id,
      sterling: sterling.id,
      vale: vale.id,
      apex: apex.id,
      ridgeway: ridgeway.id,
      creditors: creditors.map((c) => c.id),
    },
    helen: helen.id,
    records,
  };
}

export async function runDemoStoryline(db: Database, clock = new Date('2026-03-01T09:00:00Z')) {
  const world = await seedDemoWorld(db, clock);
  for (const recordId of world.records) {
    await processRecord(db, recordId);
  }
  return world;
}

async function insertStorylineRecords(
  db: Database,
  input: {
    clock: Date;
    northbridgeName: string;
    meridianName: string;
    ridgewayName: string;
    creditorNames: string[];
  },
): Promise<string[]> {
  const ids: string[] = [];
  const day0Mentions: Mention[] = [
    { ref: 'meridian', kind: 'company', name: input.meridianName, role: 'subject', identifiers: [{ scheme: 'uk_crn', value: '01299887' }], market: 'UK' },
  ];
  ids.push(
    await insertRecord(db, {
      externalId: 'gazette-meridian-admin',
      publishedAt: input.clock,
      title: 'Meridian Grocers plc — administrator appointed',
      summary: 'The company entered administration. Joint administrators were appointed at 09:00.',
      body: 'Meridian Grocers plc entered administration. Administrators appointed. Insolvency proceedings opened.',
      extracted: { mentions: day0Mentions, attributes: { signalTypes: ['insolvency.proceedings_opened'] } },
    }),
  );

  const day2Mentions: Mention[] = [
    { ref: 'northbridge', kind: 'company', name: input.northbridgeName, role: 'creditor', identifiers: [{ scheme: 'uk_crn', value: '08123456' }], market: 'UK' },
    { ref: 'meridian', kind: 'company', name: input.meridianName, role: 'debtor', identifiers: [{ scheme: 'uk_crn', value: '01299887' }], market: 'UK' },
    ...input.creditorNames.map((name, i) => ({
      ref: `creditor-${i}`,
      kind: 'company' as const,
      name,
      role: 'creditor',
      market: 'UK' as const,
    })),
  ];
  ids.push(
    await insertRecord(db, {
      externalId: 'gazette-meridian-creditors',
      publishedAt: addDays(input.clock, 2),
      title: 'Meridian Grocers plc — statement of affairs: largest unsecured creditors',
      summary: 'Northbridge Foods Ltd is named among the chain’s largest unsecured creditors.',
      body: 'Statement of affairs. Named among the largest unsecured creditors: Northbridge Foods Ltd and others.',
      extracted: { mentions: day2Mentions, attributes: { signalTypes: ['insolvency.creditor_named'] } },
    }),
  );

  ids.push(
    await insertRecord(db, {
      externalId: 'ch-northbridge-charge',
      publishedAt: addDays(input.clock, 6),
      title: 'Northbridge Foods Ltd — registration of charge by Ridgeway Bank plc',
      summary: 'Ridgeway Bank plc registers new security over stock.',
      body: 'Registration of charge. Ridgeway Bank plc. Security over stock and receivables. Floating charge.',
      extracted: {
        mentions: [
          { ref: 'northbridge', kind: 'company', name: input.northbridgeName, role: 'subject', identifiers: [{ scheme: 'uk_crn', value: '08123456' }], market: 'UK' },
          { ref: 'ridgeway', kind: 'company', name: input.ridgewayName, role: 'lender', market: 'UK' },
        ],
        attributes: { signalTypes: ['finance.security_registered'] },
      },
    }),
  );
  return ids;
}

async function insertRecord(
  db: Database,
  input: {
    externalId: string;
    publishedAt: Date;
    title: string;
    summary: string;
    body: string;
    extracted: { mentions: Mention[]; attributes?: Record<string, unknown> };
  },
): Promise<string> {
  const [row] = await db
    .insert(records)
    .values({
      sourceId: 'seed',
      externalId: input.externalId,
      publishedAt: input.publishedAt,
      title: input.title,
      summary: input.summary,
      body: input.body,
      url: `https://norfront.local/records/${input.externalId}`,
      language: 'en',
      market: 'UK',
      kind: 'insolvency',
      raw: { seeded: true },
      extracted: input.extracted,
    })
    .returning();
  return row.id;
}

async function dbUpdateCompany(
  db: Database,
  id: string,
  patch: { sector?: string; employeeCount?: number; description?: string },
) {
  const { companies } = await import('../../db/schema');
  await db.update(companies).set({ ...patch, updatedAt: new Date() }).where(eq(companies.id, id));
}
