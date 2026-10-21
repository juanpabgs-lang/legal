import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { companies, companyIdentifiers, companyPeople, people } from '../../db/schema';
import type { Identifier, Mention } from '../../domain/types';
import { normalizeName, namesMatch } from '../../lib/names';

export interface ResolvedMention {
  mention: Mention;
  companyId?: string;
  personId?: string;
  created: boolean;
}

export async function resolveMentions(db: Database, mentions: Mention[]): Promise<ResolvedMention[]> {
  const resolved: ResolvedMention[] = [];
  const companyByRef = new Map<string, string>();

  for (const mention of mentions.filter((m) => m.kind === 'company')) {
    const found = await resolveCompany(db, mention);
    companyByRef.set(mention.ref, found.id);
    resolved.push({ mention, companyId: found.id, created: found.created });
  }

  for (const mention of mentions.filter((m) => m.kind === 'person')) {
    const companyId = mention.companyRef ? companyByRef.get(mention.companyRef) : undefined;
    const found = await resolvePerson(db, mention, companyId);
    resolved.push({ mention, personId: found.id, companyId, created: found.created });
  }

  return resolved;
}

export async function resolveCompany(
  db: Database,
  mention: Pick<Mention, 'name' | 'identifiers' | 'market'>,
): Promise<{ id: string; created: boolean }> {
  for (const identifier of mention.identifiers ?? []) {
    const [hit] = await db
      .select()
      .from(companyIdentifiers)
      .where(and(eq(companyIdentifiers.scheme, identifier.scheme), eq(companyIdentifiers.value, identifier.value.toUpperCase())));
    if (hit) return { id: hit.companyId, created: false };
  }

  const normalized = normalizeName(mention.name);
  if (normalized) {
    const candidates = await db
      .select()
      .from(companies)
      .where(
        sql`${companies.normalizedName} = ${normalized} OR similarity(${companies.normalizedName}, ${normalized}) > 0.55`,
      )
      .limit(8);
    const exact = candidates.find((c) => c.normalizedName === normalized);
    const fuzzy = candidates.find((c) => namesMatch(c.name, mention.name, 0.88));
    const match = exact ?? fuzzy;
    if (match) {
      await attachIdentifiers(db, match.id, mention.identifiers ?? []);
      return { id: match.id, created: false };
    }
  }

  const [created] = await db
    .insert(companies)
    .values({
      name: mention.name,
      normalizedName: normalized || mention.name.toLowerCase(),
      market: mention.market,
      identifiers: mention.identifiers ?? [],
    })
    .returning();
  await attachIdentifiers(db, created.id, mention.identifiers ?? []);
  return { id: created.id, created: true };
}

export async function resolvePerson(
  db: Database,
  mention: Mention,
  companyId?: string,
): Promise<{ id: string; created: boolean }> {
  const normalized = normalizeName(mention.name);
  if (companyId) {
    const existing = await db
      .select({ person: people })
      .from(companyPeople)
      .innerJoin(people, eq(people.id, companyPeople.personId))
      .where(eq(companyPeople.companyId, companyId));
    const match = existing.find((row) => namesMatch(row.person.name, mention.name, 0.9));
    if (match) return { id: match.person.id, created: false };
  }

  const [byName] = await db.select().from(people).where(eq(people.normalizedName, normalized)).limit(1);
  const personId = byName
    ? byName.id
    : (
        await db
          .insert(people)
          .values({
            name: mention.name,
            normalizedName: normalized || mention.name.toLowerCase(),
            title: mention.title,
            market: mention.market,
          })
          .returning()
      )[0].id;

  if (companyId) {
    await db
      .insert(companyPeople)
      .values({
        companyId,
        personId,
        role: mention.personRole ?? 'officer',
        title: mention.title,
      })
      .onConflictDoNothing();
  }

  return { id: personId, created: !byName };
}

async function attachIdentifiers(db: Database, companyId: string, identifiers: Identifier[]): Promise<void> {
  if (!identifiers.length) return;
  await db
    .insert(companyIdentifiers)
    .values(identifiers.map((i) => ({ companyId, scheme: i.scheme, value: i.value.toUpperCase() })))
    .onConflictDoNothing();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) return;
  const merged = [...company.identifiers];
  for (const ident of identifiers) {
    if (!merged.some((m) => m.scheme === ident.scheme && m.value.toUpperCase() === ident.value.toUpperCase())) {
      merged.push({ scheme: ident.scheme, value: ident.value.toUpperCase() });
    }
  }
  await db.update(companies).set({ identifiers: merged, updatedAt: new Date() }).where(eq(companies.id, companyId));
}

export async function companiesByIds(db: Database, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(companies).where(inArray(companies.id, ids));
}
