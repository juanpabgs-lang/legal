import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  approaches,
  companies,
  contacts,
  drafts,
  firmSettings,
  messages,
  opportunities,
  partners,
  playbooks,
  records,
  replies,
  routes,
  users,
} from '../../db/schema';
import { marketLanguage } from '../../domain/taxonomy';
import { badRequest, notFound } from '../../lib/errors';
import { CONTRACT_VERSION } from '../swarm/contracts';
import { runDraft } from '../swarm/router';
import { applyFeedback } from '../learning/service';
import { checkCompliance, isCompliant } from './compliance';
import { sendMail } from './mail';

export async function ensureApproach(
  db: Database,
  opportunityId: string,
  reach: 'warm' | 'warm_and_cold',
  autonomy: 'approve' | 'playbook',
) {
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opp) return null;
  const [route] = await db.select().from(routes).where(eq(routes.opportunityId, opportunityId));
  if (!route) return null;
  if (reach === 'warm' && route.kind === 'cold') {
    const [existing] = await db.select().from(approaches).where(eq(approaches.opportunityId, opportunityId));
    if (existing) return existing;
    const [row] = await db
      .insert(approaches)
      .values({
        firmId: opp.firmId,
        opportunityId,
        partnerId: route.partnerId,
        routeId: route.id,
        kind: 'cold',
        status: 'suppressed',
        blockedReason: 'Reach is set to warm introductions only',
      })
      .returning();
    return row;
  }

  let [approach] = await db.select().from(approaches).where(eq(approaches.opportunityId, opportunityId));
  if (!approach) {
    [approach] = await db
      .insert(approaches)
      .values({
        firmId: opp.firmId,
        opportunityId,
        partnerId: route.partnerId,
        routeId: route.id,
        kind: route.kind,
        status: 'drafting',
        toName: route.candidates[0]?.contactName,
      })
      .returning();
  }
  if (approach.status === 'pending_draft' || approach.status === 'drafting' || !(await latestDraft(db, approach.id))) {
    await draftApproach(db, approach.id);
  }
  const refreshed = (await db.select().from(approaches).where(eq(approaches.id, approach.id)))[0];
  if (autonomy === 'playbook' && refreshed.status === 'pending_approval') {
    const [book] = await db
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.firmId, opp.firmId), eq(playbooks.practice, opp.practice)));
    if (book?.config.autoSend.enabled && book.config.autoSend.kinds.includes(route.kind)) {
      await approveAndSend(db, { firmId: opp.firmId, approachId: refreshed.id, userId: null });
    }
  }
  return refreshed;
}

export async function draftApproach(db: Database, approachId: string) {
  const [approach] = await db.select().from(approaches).where(eq(approaches.id, approachId));
  if (!approach) throw notFound('Approach');
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, approach.opportunityId));
  if (!opp) throw notFound('Opportunity');
  const [company] = await db.select().from(companies).where(eq(companies.id, opp.companyId));
  const [route] = approach.routeId
    ? await db.select().from(routes).where(eq(routes.id, approach.routeId))
    : [undefined];
  const [partner] = approach.partnerId
    ? await db.select().from(partners).where(eq(partners.id, approach.partnerId))
    : [undefined];
  const [user] = partner ? await db.select().from(users).where(eq(users.id, partner.userId)) : [undefined];
  const [contact] = route?.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, route.contactId))
    : [undefined];
  const recordRow = opp.eventRecordId
    ? (await db.select().from(records).where(eq(records.id, opp.eventRecordId)))[0]
    : undefined;

  if (!contact?.email && !approach.toEmail) {
    await db
      .update(approaches)
      .set({ status: 'needs_recipient', toName: contact?.name ?? route?.candidates[0]?.contactName, updatedAt: new Date() })
      .where(eq(approaches.id, approachId));
  }

  const drafted = await runDraft(
    db,
    {
      version: CONTRACT_VERSION,
      task: 'draft',
      kind: approach.kind,
      language: marketLanguage(company?.market),
      partner: {
        name: user?.name ?? 'Partner',
        title: partner?.title ?? 'Partner',
        practices: partner?.practices ?? [opp.practice],
        voiceSample: partner?.voiceSample ?? null,
        voiceNotes: partner?.voiceNotes ?? null,
      },
      recipient: {
        name: contact?.name ?? approach.toName ?? 'Counsel',
        role: contact?.role ?? null,
        companyName: company?.name ?? 'the company',
      },
      opportunity: {
        practice: opp.practice,
        rationale: opp.rationale ?? opp.practice,
        windowMinDays: opp.windowMinDays,
        windowMaxDays: opp.windowMaxDays,
      },
      records: recordRow
        ? [
            {
              id: recordRow.id,
              title: recordRow.title,
              url: recordRow.url,
              publishedAt: recordRow.publishedAt.toISOString(),
              summary: recordRow.summary,
            },
          ]
        : [],
      priorCorrespondence: route?.interactions12m ?? 0,
    },
    opp.firmId,
  );

  const compliance = await checkCompliance(db, {
    firmId: opp.firmId,
    companyId: opp.companyId,
    contactId: route?.contactId,
    market: company?.market,
    kind: approach.kind,
    subject: drafted.subject,
    body: drafted.body,
    hasCitation: drafted.citations.length > 0,
  });

  const previous = await latestDraft(db, approachId);
  const version = (previous?.version ?? 0) + 1;
  const [draft] = await db
    .insert(drafts)
    .values({
      approachId,
      version,
      source: 'swarm',
      subject: drafted.subject,
      body: drafted.body,
      citations: drafted.citations,
      compliance,
    })
    .returning();

  const nextStatus = !isCompliant(compliance)
    ? 'blocked'
    : contact?.email || approach.toEmail
      ? 'pending_approval'
      : 'needs_recipient';

  await db
    .update(approaches)
    .set({
      status: nextStatus,
      blockedReason: nextStatus === 'blocked' ? compliance.find((c) => !c.passed)?.message : null,
      toEmail: approach.toEmail ?? contact?.email ?? null,
      toName: approach.toName ?? contact?.name ?? null,
      updatedAt: new Date(),
    })
    .where(eq(approaches.id, approachId));

  return draft;
}

export async function editDraft(
  db: Database,
  input: { firmId: string; userId: string; approachId: string; subject: string; body: string },
) {
  const [approach] = await db
    .select()
    .from(approaches)
    .where(and(eq(approaches.id, input.approachId), eq(approaches.firmId, input.firmId)));
  if (!approach) throw notFound('Approach');
  const previous = await latestDraft(db, approach.id);
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, approach.opportunityId));
  const [company] = opp ? await db.select().from(companies).where(eq(companies.id, opp.companyId)) : [];
  const compliance = await checkCompliance(db, {
    firmId: input.firmId,
    companyId: opp?.companyId ?? '',
    kind: approach.kind,
    subject: input.subject,
    body: input.body,
    hasCitation: /source:/i.test(input.body),
    market: company?.market,
  });
  const [draft] = await db
    .insert(drafts)
    .values({
      approachId: approach.id,
      version: (previous?.version ?? 0) + 1,
      source: 'partner',
      subject: input.subject,
      body: input.body,
      citations: previous?.citations ?? [],
      compliance,
      createdByUserId: input.userId,
    })
    .returning();
  await db
    .update(approaches)
    .set({
      status: isCompliant(compliance) ? 'pending_approval' : 'blocked',
      blockedReason: isCompliant(compliance) ? null : compliance.find((c) => !c.passed)?.message,
      updatedAt: new Date(),
    })
    .where(eq(approaches.id, approach.id));
  return draft;
}

export async function approveAndSend(
  db: Database,
  input: { firmId: string; approachId: string; userId: string | null },
) {
  const [approach] = await db
    .select()
    .from(approaches)
    .where(and(eq(approaches.id, input.approachId), eq(approaches.firmId, input.firmId)));
  if (!approach) throw notFound('Approach');
  const draft = await latestDraft(db, approach.id);
  if (!draft) throw badRequest('No draft to send');
  if (!isCompliant(draft.compliance)) throw badRequest('Draft failed compliance');
  if (!approach.toEmail) throw badRequest('No recipient email');
  const [partner] = approach.partnerId
    ? await db.select().from(partners).where(eq(partners.id, approach.partnerId))
    : [undefined];
  const from = partner?.mailboxEmail ?? getFromFallback();
  const sent = await sendMail(db, {
    firmId: input.firmId,
    from,
    to: approach.toEmail,
    subject: draft.subject,
    body: draft.body,
  });
  const [message] = await db
    .insert(messages)
    .values({
      approachId: approach.id,
      draftId: draft.id,
      provider: sent.provider,
      providerMessageId: sent.providerMessageId,
      fromAddress: from,
      toAddress: approach.toEmail,
      subject: draft.subject,
      body: draft.body,
    })
    .returning();
  await db
    .update(approaches)
    .set({ status: 'sent', approvedAt: new Date(), sentAt: new Date(), updatedAt: new Date() })
    .where(eq(approaches.id, approach.id));
  await db
    .update(opportunities)
    .set({ status: 'contacted', updatedAt: new Date() })
    .where(eq(opportunities.id, approach.opportunityId));
  return { approachId: approach.id, messageId: message.id, provider: sent.provider };
}

export async function markReply(
  db: Database,
  input: { firmId: string; userId: string; approachId: string; fromAddress?: string; body?: string },
) {
  const [approach] = await db
    .select()
    .from(approaches)
    .where(and(eq(approaches.id, input.approachId), eq(approaches.firmId, input.firmId)));
  if (!approach) throw notFound('Approach');
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.approachId, approach.id))
    .orderBy(desc(messages.sentAt))
    .limit(1);
  if (!message) throw badRequest('Nothing has been sent yet');
  await db.insert(replies).values({
    messageId: message.id,
    approachId: approach.id,
    fromAddress: input.fromAddress ?? approach.toEmail ?? 'unknown',
    body: input.body,
    source: 'manual',
  });
  await db.update(approaches).set({ status: 'replied', updatedAt: new Date() }).where(eq(approaches.id, approach.id));
  await db
    .update(opportunities)
    .set({ status: 'replied', updatedAt: new Date() })
    .where(eq(opportunities.id, approach.opportunityId));
  await applyFeedback(db, {
    firmId: input.firmId,
    userId: input.userId,
    opportunityId: approach.opportunityId,
    kind: 'reply',
  });
  return { ok: true };
}

export async function latestDraft(db: Database, approachId: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(eq(drafts.approachId, approachId))
    .orderBy(desc(drafts.version))
    .limit(1);
  return row ?? null;
}

function getFromFallback(): string {
  return 'partner@norfront.local';
}

export { firmSettings };
