import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  approaches,
  companies,
  drafts,
  firms,
  opportunities,
  partners,
  records,
  users,
} from '../../db/schema';
import { PRACTICE_LABELS, type Practice } from '../../domain/taxonomy';
import { approveAndSend } from '../outreach/service';

const ROLE_WHY: Record<string, string> = {
  creditor: 'Named on the supermarket’s list of unpaid suppliers',
  supplier: 'Supplies the supermarket that just failed',
  landlord: 'Landlord of the stores',
  lender: 'The supermarket’s lender',
  bidder: 'Bidding for the best stores',
  operator: 'Runs the warehouses, so the staff may transfer',
};

export async function getDemoStory(db: Database) {
  const [firm] = await db.select().from(firms).where(eq(firms.slug, 'legara'));
  if (!firm) return null;

  const oppRows = await db.select().from(opportunities).where(eq(opportunities.firmId, firm.id));
  const companyRows = await db.select().from(companies);
  const nameOf = new Map(companyRows.map((c) => [c.id, c.name]));
  const northbridge = companyRows.find((c) => c.normalizedName.includes('northbridge'));

  const focusRows = northbridge ? oppRows.filter((o) => o.companyId === northbridge.id) : [];
  const commercial =
    focusRows.find((o) => o.practice === 'commercial') ??
    [...focusRows].sort((a, b) => b.likelihood - a.likelihood)[0];

  let approach: {
    approachId: string;
    status: string;
    toName: string | null;
    toEmail: string | null;
    subject: string;
    body: string;
    partnerName: string;
  } | null = null;

  if (commercial) {
    const [row] = await db
      .select()
      .from(approaches)
      .where(eq(approaches.opportunityId, commercial.id))
      .orderBy(desc(approaches.createdAt))
      .limit(1);
    if (row) {
      const [draft] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.approachId, row.id))
        .orderBy(desc(drafts.version))
        .limit(1);
      const [partner] = row.partnerId
        ? await db.select().from(partners).where(eq(partners.id, row.partnerId))
        : [];
      const [user] = partner ? await db.select().from(users).where(eq(users.id, partner.userId)) : [];
      approach = {
        approachId: row.id,
        status: row.status,
        toName: row.toName,
        toEmail: row.toEmail,
        subject: draft?.subject ?? '',
        body: draft?.body ?? '',
        partnerName: user?.name ?? 'James Ellison',
      };
    }
  }

  const seedRecords = await db
    .select()
    .from(records)
    .where(and(eq(records.sourceId, 'seed'), eq(records.market, 'UK')))
    .orderBy(asc(records.publishedAt));

  const days = ['Monday', 'Wednesday', 'The following Tuesday'];
  const feed = seedRecords.slice(0, 3).map((record, index) => ({
    day: days[index] ?? `Day ${index}`,
    title: record.title,
    summary: record.summary,
  }));

  const seen = new Set<string>();
  const cascade = [];
  for (const opp of oppRows) {
    if (!opp.exposureRole || opp.companyId === northbridge?.id) continue;
    const key = `${opp.companyId}:${opp.practice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cascade.push({
      company: nameOf.get(opp.companyId) ?? 'A related company',
      why: ROLE_WHY[opp.exposureRole] ?? opp.exposureRole,
      practice: PRACTICE_LABELS[opp.practice as Practice] ?? opp.practice,
      role: opp.exposureRole,
    });
  }
  cascade.sort((a, b) => a.practice.localeCompare(b.practice) || a.company.localeCompare(b.company));

  const practices = ['insolvency', 'commercial', 'banking']
    .map((practice) => focusRows.find((o) => o.practice === practice))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .map((o) => ({
      name: PRACTICE_LABELS[o.practice],
      likelihood: Math.round(o.likelihood * 100),
    }));

  return {
    firm: 'Legara',
    company: northbridge?.name ?? 'Northbridge Foods Ltd',
    companyDetail: 'Regional food distributor. About 80 people. Not a Legara client.',
    window: '2 to 4 weeks',
    practices,
    exchanges: 9,
    contact: approach?.toName ?? 'Helen Cartwright',
    approach,
    feed,
    cascade,
    cascadeCount: cascade.length,
  };
}

export async function sendDemoApproach(db: Database, approachId: string) {
  const [approach] = await db.select().from(approaches).where(eq(approaches.id, approachId));
  if (!approach) return null;
  const [firm] = await db.select().from(firms).where(eq(firms.id, approach.firmId));
  if (!firm || firm.slug !== 'legara') return null;
  const [admin] = await db
    .select()
    .from(users)
    .where(and(eq(users.firmId, firm.id), eq(users.role, 'admin')));
  const result = await approveAndSend(db, {
    firmId: firm.id,
    approachId,
    userId: admin?.id ?? null,
  });
  return result;
}
