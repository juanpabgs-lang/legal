import { and, eq, gte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { companies, contacts, interactions, opportunities, partners, people, practiceGroups, routes, users } from '../../db/schema';
import type { RouteCandidate, RoutePathStep } from '../../domain/types';
import { addDays } from '../../lib/time';

export async function routeOpportunity(db: Database, opportunityId: string) {
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opp) return null;
  const [company] = await db.select().from(companies).where(eq(companies.id, opp.companyId));
  const firmContacts = await db.select().from(contacts).where(and(eq(contacts.firmId, opp.firmId), eq(contacts.companyId, opp.companyId)));
  const partnerRows = await db.select().from(partners).where(eq(partners.firmId, opp.firmId));
  const userRows = await db.select().from(users).where(eq(users.firmId, opp.firmId));
  const since = addDays(new Date(), -365);
  const candidates: RouteCandidate[] = [];

  for (const contact of firmContacts) {
    if (contact.doNotContact) continue;
    const history = await db
      .select()
      .from(interactions)
      .where(and(eq(interactions.contactId, contact.id), gte(interactions.occurredAt, since)));
    const byPartner = new Map<string, { count: number; last: Date | null; channel: string }>();
    for (const item of history) {
      const current = byPartner.get(item.partnerId) ?? { count: 0, last: null, channel: item.channel };
      current.count += item.count;
      if (!current.last || item.occurredAt > current.last) current.last = item.occurredAt;
      current.channel = item.channel;
      byPartner.set(item.partnerId, current);
    }
    for (const [partnerId, stats] of byPartner) {
      const partner = partnerRows.find((p) => p.id === partnerId);
      const user = userRows.find((u) => u.id === partner?.userId);
      if (!partner || !user) continue;
      const practiceBoost = partner.practices.includes(opp.practice) ? 0.15 : 0;
      const recency = stats.last ? Math.max(0, 1 - (Date.now() - stats.last.getTime()) / (365 * 86_400_000)) : 0;
      const tie = Math.min(1, stats.count / 12);
      const score = tie * 0.7 + recency * 0.15 + practiceBoost;
      candidates.push({
        partnerId: partner.id,
        partnerName: user.name,
        contactId: contact.id,
        contactName: contact.name,
        contactRole: contact.role,
        tieStrength: Number(tie.toFixed(3)),
        interactions12m: stats.count,
        lastInteractionAt: stats.last?.toISOString() ?? null,
        channel: stats.channel,
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.interactions12m - a.interactions12m);
  const best = candidates[0];
  const kind = best && best.interactions12m > 0 ? 'warm' : 'cold';

  let partnerId = best?.partnerId ?? null;
  if (!partnerId) {
    const [group] = await db
      .select()
      .from(practiceGroups)
      .where(and(eq(practiceGroups.firmId, opp.firmId), eq(practiceGroups.practice, opp.practice)));
    partnerId = group?.leadPartnerId ?? partnerRows.find((p) => p.practices.includes(opp.practice))?.id ?? partnerRows[0]?.id ?? null;
  }

  const path: RoutePathStep[] = [];
  if (partnerId) {
    const partner = partnerRows.find((p) => p.id === partnerId);
    const user = userRows.find((u) => u.id === partner?.userId);
    if (user) path.push({ kind: 'partner', id: partnerId, name: user.name, detail: partner?.title });
  }
  if (best) {
    path.push({
      kind: 'contact',
      id: best.contactId,
      name: best.contactName,
      detail: `${best.interactions12m} exchanges in the last year`,
    });
  }
  if (company) path.push({ kind: 'company', id: company.id, name: company.name });

  const [route] = await db
    .insert(routes)
    .values({
      opportunityId: opp.id,
      partnerId,
      contactId: best?.contactId ?? firmContacts[0]?.id ?? null,
      kind,
      tieStrength: best?.tieStrength ?? 0,
      interactions12m: best?.interactions12m ?? 0,
      path,
      candidates,
    })
    .onConflictDoUpdate({
      target: [routes.opportunityId],
      set: {
        partnerId,
        contactId: best?.contactId ?? firmContacts[0]?.id ?? null,
        kind,
        tieStrength: best?.tieStrength ?? 0,
        interactions12m: best?.interactions12m ?? 0,
        path,
        candidates,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db
    .update(opportunities)
    .set({ assignedPartnerId: partnerId, updatedAt: new Date() })
    .where(eq(opportunities.id, opp.id));

  return route;
}

export async function getRoute(db: Database, opportunityId: string) {
  const [row] = await db.select().from(routes).where(eq(routes.opportunityId, opportunityId));
  return row ?? null;
}

export { people };
