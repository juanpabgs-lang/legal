import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  approaches,
  companies,
  feedback,
  messages,
  opportunities,
  partners,
  pilotWeeks,
  pilots,
  replies,
  scorecards,
  users,
} from '../../db/schema';
import type { Practice } from '../../domain/taxonomy';
import { addDays } from '../../lib/time';
import { notFound } from '../../lib/errors';

export async function startPilot(
  db: Database,
  input: { firmId: string; name: string; practices: Practice[]; startedAt?: Date },
) {
  const startedAt = input.startedAt ?? new Date();
  const [pilot] = await db
    .insert(pilots)
    .values({
      firmId: input.firmId,
      name: input.name,
      status: 'running',
      startedAt,
      practices: input.practices,
    })
    .returning();
  for (let week = 1; week <= 8; week += 1) {
    await db.insert(pilotWeeks).values({
      pilotId: pilot.id,
      week,
      startsAt: addDays(startedAt, (week - 1) * 7),
      endsAt: addDays(startedAt, week * 7),
    });
  }
  return pilot;
}

export async function rollWeek(db: Database, firmId: string, pilotId: string, week: number) {
  const [pilot] = await db
    .select()
    .from(pilots)
    .where(and(eq(pilots.id, pilotId), eq(pilots.firmId, firmId)));
  if (!pilot) throw notFound('Pilot');
  const [slot] = await db
    .select()
    .from(pilotWeeks)
    .where(and(eq(pilotWeeks.pilotId, pilotId), eq(pilotWeeks.week, week)));
  if (!slot) throw notFound('Pilot week');
  const opps = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.firmId, firmId),
        gte(opportunities.createdAt, slot.startsAt),
        lte(opportunities.createdAt, slot.endsAt),
      ),
    );
  const accepted = opps.filter((o) => ['accepted', 'contacted', 'replied', 'meeting', 'pitched', 'matter_opened', 'won'].includes(o.status)).length;
  const dismissed = opps.filter((o) => o.status === 'dismissed').length;
  const sentRows = await db
    .select()
    .from(approaches)
    .where(and(eq(approaches.firmId, firmId), gte(approaches.sentAt, slot.startsAt), lte(approaches.sentAt, slot.endsAt)));
  const replyRows = await db
    .select()
    .from(replies)
    .where(and(gte(replies.receivedAt, slot.startsAt), lte(replies.receivedAt, slot.endsAt)));
  const [updated] = await db
    .update(pilotWeeks)
    .set({
      shortlistSize: opps.filter((o) => o.status !== 'new' && o.status !== 'excluded').length,
      accepted,
      dismissed,
      sent: sentRows.length,
      replies: replyRows.length,
      report: { opportunityIds: opps.map((o) => o.id) },
      updatedAt: new Date(),
    })
    .where(eq(pilotWeeks.id, slot.id))
    .returning();
  return updated;
}

export async function buildScorecard(db: Database, firmId: string, pilotId?: string) {
  const oppRows = await db.select().from(opportunities).where(eq(opportunities.firmId, firmId));
  const approachRows = await db.select().from(approaches).where(eq(approaches.firmId, firmId));
  const messageRows = await db.select().from(messages);
  const replyRows = await db.select().from(replies);
  const feedbackRows = await db.select().from(feedback).where(eq(feedback.firmId, firmId));
  const partnerRows = await db.select().from(partners).where(eq(partners.firmId, firmId));
  const userRows = await db.select().from(users).where(eq(users.firmId, firmId));
  const companyRows = await db.select().from(companies);

  const predicted = oppRows.filter((o) => o.status !== 'excluded');
  const realized = predicted.filter((o) =>
    ['replied', 'meeting', 'pitched', 'matter_opened', 'won'].includes(o.status),
  );
  const byPartner = partnerRows.map((partner) => {
    const user = userRows.find((u) => u.id === partner.userId);
    const assigned = oppRows.filter((o) => o.assignedPartnerId === partner.id);
    return {
      partnerId: partner.id,
      name: user?.name ?? partner.id,
      assigned: assigned.length,
      accepted: assigned.filter((o) => o.status === 'accepted' || o.status === 'contacted' || o.status === 'replied' || o.status === 'matter_opened' || o.status === 'won').length,
      sent: approachRows.filter((a) => a.partnerId === partner.id && a.sentAt).length,
      replies: approachRows.filter((a) => a.partnerId === partner.id && a.status === 'replied').length,
      matters: assigned.filter((o) => o.status === 'matter_opened' || o.status === 'won').length,
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    predictions: predicted.length,
    hitRate: predicted.length ? realized.length / predicted.length : 0,
    messages: messageRows.filter((m) => approachRows.some((a) => a.id === m.approachId)).length,
    replies: replyRows.length,
    meetings: oppRows.filter((o) => o.status === 'meeting').length,
    matters: oppRows.filter((o) => o.status === 'matter_opened' || o.status === 'won').length,
    accepted: feedbackRows.filter((f) => f.kind === 'accept').length,
    dismissed: feedbackRows.filter((f) => f.kind === 'dismiss').length,
    byPartner,
    examples: predicted.slice(0, 12).map((o) => ({
      id: o.id,
      company: companyRows.find((c) => c.id === o.companyId)?.name,
      practice: o.practice,
      likelihood: o.likelihood,
      status: o.status,
    })),
  };

  const [row] = await db
    .insert(scorecards)
    .values({ firmId, pilotId: pilotId ?? null, payload })
    .returning();
  if (pilotId) {
    await db.update(pilots).set({ status: 'scored', endedAt: new Date(), updatedAt: new Date() }).where(eq(pilots.id, pilotId));
  }
  return row;
}

export async function getPilot(db: Database, firmId: string, id: string) {
  const [pilot] = await db.select().from(pilots).where(and(eq(pilots.id, id), eq(pilots.firmId, firmId)));
  if (!pilot) throw notFound('Pilot');
  const weeks = await db.select().from(pilotWeeks).where(eq(pilotWeeks.pilotId, id));
  const [card] = await db
    .select()
    .from(scorecards)
    .where(eq(scorecards.pilotId, id))
    .orderBy(desc(scorecards.generatedAt))
    .limit(1);
  return { pilot, weeks, scorecard: card ?? null };
}

export { inArray };
