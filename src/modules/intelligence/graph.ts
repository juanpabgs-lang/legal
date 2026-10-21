import { and, eq, or } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { relationships } from '../../db/schema';
import type { RelationshipType } from '../../domain/taxonomy';

export async function upsertRelationship(
  db: Database,
  input: {
    fromCompanyId: string;
    toCompanyId: string;
    type: RelationshipType;
    evidenceRecordId?: string | null;
    amount?: number | null;
    currency?: string | null;
    attributes?: Record<string, unknown>;
  },
): Promise<string> {
  const [existing] = await db
    .select()
    .from(relationships)
    .where(
      and(
        eq(relationships.fromCompanyId, input.fromCompanyId),
        eq(relationships.toCompanyId, input.toCompanyId),
        eq(relationships.type, input.type),
      ),
    );
  if (existing) {
    await db
      .update(relationships)
      .set({
        evidenceRecordId: input.evidenceRecordId ?? existing.evidenceRecordId,
        amount: input.amount != null ? String(input.amount) : existing.amount,
        currency: input.currency ?? existing.currency,
        attributes: { ...existing.attributes, ...input.attributes },
        updatedAt: new Date(),
      })
      .where(eq(relationships.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(relationships)
    .values({
      fromCompanyId: input.fromCompanyId,
      toCompanyId: input.toCompanyId,
      type: input.type,
      evidenceRecordId: input.evidenceRecordId ?? null,
      amount: input.amount != null ? String(input.amount) : null,
      currency: input.currency ?? null,
      attributes: input.attributes ?? {},
    })
    .returning();
  return created.id;
}

export async function neighbors(db: Database, companyId: string) {
  return db
    .select()
    .from(relationships)
    .where(or(eq(relationships.fromCompanyId, companyId), eq(relationships.toCompanyId, companyId)));
}

export function invertType(type: RelationshipType): RelationshipType | null {
  switch (type) {
    case 'owns':
      return null;
    case 'lends_to':
      return null;
    case 'supplies':
      return null;
    case 'landlord_of':
      return null;
    case 'operates_for':
      return null;
    case 'bidder_for':
      return null;
    case 'creditor_of':
      return null;
    default:
      return null;
  }
}
