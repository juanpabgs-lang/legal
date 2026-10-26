import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  clientRelationships,
  contacts,
  firmSettings,
  firms,
  interactions,
  modelVersions,
  outreachRules,
  partners,
  playbooks,
  practiceGroups,
  users,
} from '../../db/schema';
import type { Market, Practice, UserRole } from '../../domain/taxonomy';
import type { FocusSettings } from '../../domain/types';
import { badRequest, notFound } from '../../lib/errors';
import { normalizeName } from '../../lib/names';
import { hashForUser } from '../auth/service';
import { resolveCompany } from '../intelligence/resolver';
import { DEFAULT_OUTREACH_RULES, DEFAULT_PLAYBOOKS } from './playbooks';

export interface CreateFirmInput {
  name: string;
  slug: string;
  markets?: Market[];
  admin: { email: string; name: string; password: string };
}

export async function createFirm(db: Database, input: CreateFirmInput) {
  const [firm] = await db
    .insert(firms)
    .values({ name: input.name, slug: input.slug, markets: input.markets ?? ['UK'] })
    .returning();
  const admin = await createUser(db, {
    firmId: firm.id,
    email: input.admin.email,
    name: input.admin.name,
    password: input.admin.password,
    role: 'admin',
  });
  await db.insert(firmSettings).values({ firmId: firm.id });
  await db.insert(modelVersions).values({ firmId: firm.id, version: 1, weights: {}, notes: 'initial', active: true });
  for (const [practice, config] of Object.entries(DEFAULT_PLAYBOOKS) as Array<[Practice, (typeof DEFAULT_PLAYBOOKS)[Practice]]>) {
    await db.insert(playbooks).values({ firmId: firm.id, practice, config });
    await db.insert(practiceGroups).values({ firmId: firm.id, practice, name: config.description.slice(0, 80) });
  }
  for (const rule of DEFAULT_OUTREACH_RULES) {
    await db.insert(outreachRules).values({ firmId: firm.id, market: rule.market, kind: rule.kind, config: rule.config });
  }
  return { firm, admin };
}

export async function createUser(
  db: Database,
  input: { firmId: string; email: string; name: string; password: string; role: UserRole },
) {
  const [user] = await db
    .insert(users)
    .values({
      firmId: input.firmId,
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      passwordHash: await hashForUser(input.password),
    })
    .returning();
  return user;
}

export async function createPartner(
  db: Database,
  input: {
    firmId: string;
    user: { email: string; name: string; password: string };
    practices: Practice[];
    title?: string;
    voiceSample?: string;
    voiceNotes?: string;
    mailboxEmail?: string;
  },
) {
  const user = await createUser(db, {
    firmId: input.firmId,
    email: input.user.email,
    name: input.user.name,
    password: input.user.password,
    role: 'partner',
  });
  const [group] = await db
    .select()
    .from(practiceGroups)
    .where(and(eq(practiceGroups.firmId, input.firmId), eq(practiceGroups.practice, input.practices[0])));
  const [partner] = await db
    .insert(partners)
    .values({
      firmId: input.firmId,
      userId: user.id,
      practiceGroupId: group?.id,
      practices: input.practices,
      title: input.title ?? 'Partner',
      voiceSample: input.voiceSample,
      voiceNotes: input.voiceNotes,
      mailboxEmail: input.mailboxEmail ?? input.user.email,
    })
    .returning();
  return { user, partner };
}

export async function updateSettings(
  db: Database,
  firmId: string,
  patch: {
    volume?: 'focused' | 'balanced' | 'all';
    reach?: 'warm' | 'warm_and_cold';
    autonomy?: 'approve' | 'playbook';
    focus?: FocusSettings;
    weeklyShortlistSize?: number;
  },
) {
  const [row] = await db
    .update(firmSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(firmSettings.firmId, firmId))
    .returning();
  if (!row) throw notFound('Firm settings');
  return row;
}

export async function getFirmBundle(db: Database, firmId: string) {
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) throw notFound('Firm');
  const [settings] = await db.select().from(firmSettings).where(eq(firmSettings.firmId, firmId));
  const books = await db.select().from(playbooks).where(eq(playbooks.firmId, firmId));
  const rules = await db.select().from(outreachRules).where(eq(outreachRules.firmId, firmId));
  const partnerRows = await db.select().from(partners).where(eq(partners.firmId, firmId));
  return { firm, settings, playbooks: books, rules, partners: partnerRows };
}

export interface ContactImportRow {
  name: string;
  email?: string;
  role?: string;
  title?: string;
  companyName?: string;
  companyNumber?: string;
  market?: string;
}

export async function importContacts(db: Database, firmId: string, rows: ContactImportRow[]) {
  let created = 0;
  for (const row of rows) {
    if (!row.name) throw badRequest('Contact name is required');
    let companyId: string | undefined;
    if (row.companyName) {
      const company = await resolveCompany(db, {
        name: row.companyName,
        market: row.market as never,
        identifiers: row.companyNumber ? [{ scheme: 'uk_crn', value: row.companyNumber }] : [],
      });
      companyId = company.id;
    }
    await db.insert(contacts).values({
      firmId,
      companyId,
      name: row.name,
      email: row.email?.toLowerCase(),
      role: (row.role as never) ?? null,
      title: row.title,
    });
    created += 1;
  }
  return { created };
}

export interface InteractionImportRow {
  partnerEmail: string;
  contactEmail?: string;
  contactName?: string;
  companyName?: string;
  channel?: string;
  direction?: 'in' | 'out' | 'both';
  occurredAt: string;
  count?: number;
}

export async function importInteractions(db: Database, firmId: string, rows: InteractionImportRow[]) {
  let created = 0;
  const partnerList = await db.select().from(partners).where(eq(partners.firmId, firmId));
  const userList = await db.select().from(users).where(eq(users.firmId, firmId));
  for (const row of rows) {
    const user = userList.find((u) => u.email === row.partnerEmail.toLowerCase());
    const partner = partnerList.find((p) => p.userId === user?.id);
    if (!partner) throw badRequest(`Unknown partner ${row.partnerEmail}`);
    let contact = (await db.select().from(contacts).where(eq(contacts.firmId, firmId))).find((c) => {
      if (row.contactEmail) return c.email === row.contactEmail.toLowerCase();
      return normalizeName(c.name) === normalizeName(row.contactName ?? '');
    });
    if (!contact) {
      if (!row.contactName && !row.contactEmail) throw badRequest('Interaction needs a contact');
      const [createdContact] = await db
        .insert(contacts)
        .values({
          firmId,
          name: row.contactName ?? row.contactEmail ?? 'Unknown',
          email: row.contactEmail?.toLowerCase(),
        })
        .returning();
      contact = createdContact;
    }
    await db.insert(interactions).values({
      firmId,
      partnerId: partner.id,
      contactId: contact.id,
      channel: row.channel ?? 'email',
      direction: row.direction ?? 'out',
      occurredAt: new Date(row.occurredAt),
      count: row.count ?? 1,
    });
    created += 1;
  }
  return { created };
}

export interface ClientImportRow {
  companyName: string;
  status: 'client' | 'conflict' | 'panel' | 'do_not_contact';
  practices?: Practice[];
  lastMatterAt?: string;
  notes?: string;
  market?: string;
}

export async function importClients(db: Database, firmId: string, rows: ClientImportRow[]) {
  let created = 0;
  for (const row of rows) {
    const company = await resolveCompany(db, { name: row.companyName, market: row.market as never });
    await db
      .insert(clientRelationships)
      .values({
        firmId,
        companyId: company.id,
        status: row.status,
        practices: row.practices ?? [],
        lastMatterAt: row.lastMatterAt ? new Date(row.lastMatterAt) : null,
        notes: row.notes,
      })
      .onConflictDoNothing();
    created += 1;
  }
  return { created };
}
