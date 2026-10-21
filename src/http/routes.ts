import { createHmac } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getConfig } from '../config';
import { outboxMessages, playbooks, records, sources, swarmCalls, webhookInbox } from '../db/schema';
import { MARKETS, OPPORTUNITY_STATUSES, PRACTICES, USER_ROLES } from '../domain/taxonomy';
import { forbidden, notFound } from '../lib/errors';
import { pageQuery } from '../lib/pagination';
import { activityBus, listActivity, writeAudit } from '../modules/activity/service';
import { assertRole, createApiKey, hasRole, login } from '../modules/auth/service';
import { parseCsv, parseJsonArray } from '../modules/firm/csv';
import {
  createPartner,
  getFirmBundle,
  importClients,
  importContacts,
  importInteractions,
  updateSettings,
} from '../modules/firm/service';
import { markReply, approveAndSend, editDraft, latestDraft } from '../modules/outreach/service';
import { decideOpportunity, getOpportunity, listOpportunities } from '../modules/opportunities/service';
import { buildScorecard, getPilot, rollWeek, startPilot } from '../modules/pilot/service';
import { processRecord } from '../modules/pipeline/process-record';
import { ingestSource } from '../modules/sources/ingest';
import { authenticate, getUser } from './auth-hook';

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const settingsBody = z.object({
  volume: z.enum(['focused', 'balanced', 'all']).optional(),
  reach: z.enum(['warm', 'warm_and_cold']).optional(),
  autonomy: z.enum(['approve', 'playbook']).optional(),
  weeklyShortlistSize: z.number().int().min(1).max(200).optional(),
  focus: z
    .object({
      practices: z.array(z.enum(PRACTICES)).optional(),
      markets: z.array(z.enum(MARKETS)).optional(),
      sectors: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      minEmployees: z.number().optional(),
      maxEmployees: z.number().optional(),
    })
    .optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true }));
  app.get('/v1/health', async () => ({ ok: true, service: 'norfront' }));
  app.get('/v1/ready', async () => {
    await app.db.execute(sql`select 1`);
    return { ok: true };
  });

  app.post('/v1/auth/login', { schema: { tags: ['auth'], body: loginBody } }, async (req) => {
    const body = req.body as z.infer<typeof loginBody>;
    return login(app.db, body.email, body.password);
  });

  app.post(
    '/v1/auth/api-keys',
    { preHandler: authenticate, schema: { tags: ['auth'], body: z.object({ name: z.string() }) } },
    async (req) => {
      const user = getUser(req);
      assertRole(user, 'bd');
      return createApiKey(app.db, user, (req.body as { name: string }).name);
    },
  );

  app.get('/v1/me', { preHandler: authenticate }, async (req) => getUser(req));

  app.get('/v1/firm', { preHandler: authenticate, schema: { tags: ['firm'] } }, async (req) => {
    return getFirmBundle(app.db, getUser(req).firmId);
  });

  app.patch('/v1/firm/settings', { preHandler: authenticate, schema: { tags: ['firm'], body: settingsBody } }, async (req) => {
    const user = getUser(req);
    assertRole(user, 'bd');
    const settings = await updateSettings(app.db, user.firmId, req.body as z.infer<typeof settingsBody>);
    await writeAudit(app.db, { firmId: user.firmId, userId: user.id, action: 'settings.update', entity: 'firm_settings', entityId: user.firmId });
    return settings;
  });

  app.patch(
    '/v1/playbooks/:practice',
    {
      preHandler: authenticate,
      schema: { tags: ['firm'], params: z.object({ practice: z.enum(PRACTICES) }), body: z.object({ enabled: z.boolean().optional(), config: z.record(z.string(), z.unknown()).optional() }) },
    },
    async (req) => {
      const user = getUser(req);
      assertRole(user, 'bd');
      const { practice } = req.params as { practice: (typeof PRACTICES)[number] };
      const body = req.body as { enabled?: boolean; config?: Record<string, unknown> };
      const [existing] = await app.db
        .select()
        .from(playbooks)
        .where(and(eq(playbooks.firmId, user.firmId), eq(playbooks.practice, practice)));
      if (!existing) throw notFound('Playbook');
      const [row] = await app.db
        .update(playbooks)
        .set({
          enabled: body.enabled ?? existing.enabled,
          config: body.config ? { ...existing.config, ...body.config } : existing.config,
          updatedAt: new Date(),
        })
        .where(eq(playbooks.id, existing.id))
        .returning();
      return row;
    },
  );

  app.post(
    '/v1/partners',
    {
      preHandler: authenticate,
      schema: {
        tags: ['firm'],
        body: z.object({
          email: z.string().email(),
          name: z.string(),
          password: z.string().min(8),
          practices: z.array(z.enum(PRACTICES)).min(1),
          title: z.string().optional(),
          voiceSample: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const user = getUser(req);
      assertRole(user, 'admin');
      const body = req.body as { email: string; name: string; password: string; practices: (typeof PRACTICES)[number][]; title?: string; voiceSample?: string };
      return createPartner(app.db, {
        firmId: user.firmId,
        user: { email: body.email, name: body.name, password: body.password },
        practices: body.practices,
        title: body.title,
        voiceSample: body.voiceSample,
      });
    },
  );

  app.post('/v1/imports/contacts', { preHandler: authenticate }, async (req) => {
    const user = getUser(req);
    assertRole(user, 'bd');
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const rows = text.trim().startsWith('[') ? parseJsonArray(text) : parseCsv(text);
    return importContacts(app.db, user.firmId, rows as never);
  });

  app.post('/v1/imports/interactions', { preHandler: authenticate }, async (req) => {
    const user = getUser(req);
    assertRole(user, 'bd');
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const rows = text.trim().startsWith('[') ? parseJsonArray(text) : parseCsv(text);
    return importInteractions(app.db, user.firmId, rows as never);
  });

  app.post('/v1/imports/clients', { preHandler: authenticate }, async (req) => {
    const user = getUser(req);
    assertRole(user, 'bd');
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const rows = text.trim().startsWith('[') ? parseJsonArray(text) : parseCsv(text);
    return importClients(app.db, user.firmId, rows as never);
  });

  app.post('/v1/imports/conflicts', { preHandler: authenticate }, async (req) => {
    const user = getUser(req);
    assertRole(user, 'bd');
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const rows = (text.trim().startsWith('[') ? parseJsonArray(text) : parseCsv(text)) as Array<Record<string, string>>;
    return importClients(
      app.db,
      user.firmId,
      rows.map((r) => ({ companyName: r.companyName ?? r.name, status: 'conflict' as const, notes: r.notes })),
    );
  });

  app.get(
    '/v1/opportunities',
    { preHandler: authenticate, schema: { tags: ['opportunities'], querystring: pageQuery.extend({ status: z.enum(OPPORTUNITY_STATUSES).optional(), practice: z.enum(PRACTICES).optional() }) } },
    async (req) => {
      const user = getUser(req);
      const query = req.query as { status?: (typeof OPPORTUNITY_STATUSES)[number]; practice?: (typeof PRACTICES)[number]; limit?: number };
      const items = await listOpportunities(app.db, user.firmId, {
        status: query.status,
        practice: query.practice,
        partnerId: user.role === 'partner' ? user.partnerId : undefined,
        limit: query.limit,
      });
      return { items };
    },
  );

  app.get('/v1/opportunities/:id', { preHandler: authenticate, schema: { tags: ['opportunities'], params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    const opp = await getOpportunity(app.db, user.firmId, id);
    if (user.role === 'partner' && opp.assignedPartnerId && opp.assignedPartnerId !== user.partnerId) throw forbidden();
    return opp;
  });

  app.post('/v1/opportunities/:id/accept', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const user = getUser(req);
    return decideOpportunity(app.db, { firmId: user.firmId, userId: user.id, opportunityId: (req.params as { id: string }).id, kind: 'accept' });
  });

  app.post('/v1/opportunities/:id/dismiss', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ reason: z.string().optional() }).optional() } }, async (req) => {
    const user = getUser(req);
    return decideOpportunity(app.db, {
      firmId: user.firmId,
      userId: user.id,
      opportunityId: (req.params as { id: string }).id,
      kind: 'dismiss',
      reason: (req.body as { reason?: string } | undefined)?.reason,
    });
  });

  app.patch(
    '/v1/approaches/:id/draft',
    { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ subject: z.string(), body: z.string() }) } },
    async (req) => {
      const user = getUser(req);
      const body = req.body as { subject: string; body: string };
      return editDraft(app.db, { firmId: user.firmId, userId: user.id, approachId: (req.params as { id: string }).id, subject: body.subject, body: body.body });
    },
  );

  app.post('/v1/approaches/:id/approve', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const user = getUser(req);
    return approveAndSend(app.db, { firmId: user.firmId, approachId: (req.params as { id: string }).id, userId: user.id });
  });

  app.post('/v1/approaches/:id/reply', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ fromAddress: z.string().optional(), body: z.string().optional() }).optional() } }, async (req) => {
    const user = getUser(req);
    const body = (req.body ?? {}) as { fromAddress?: string; body?: string };
    return markReply(app.db, { firmId: user.firmId, userId: user.id, approachId: (req.params as { id: string }).id, fromAddress: body.fromAddress, body: body.body });
  });

  app.get('/v1/approaches/:id/draft', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    return latestDraft(app.db, (req.params as { id: string }).id);
  });

  app.get('/v1/records', { preHandler: authenticate, schema: { tags: ['records'], querystring: pageQuery } }, async (req) => {
    const limit = (req.query as { limit?: number }).limit ?? 50;
    const items = await app.db.select().from(records).orderBy(desc(records.publishedAt)).limit(limit);
    return { items };
  });

  app.get('/v1/sources', { preHandler: authenticate }, async () => {
    const items = await app.db.select().from(sources);
    return { items };
  });

  app.get('/v1/outbox', { preHandler: authenticate }, async (req) => {
    const user = getUser(req);
    const items = await app.db.select().from(outboxMessages).where(eq(outboxMessages.firmId, user.firmId)).orderBy(desc(outboxMessages.sentAt)).limit(50);
    return { items };
  });

  app.post(
    '/v1/pilots',
    { preHandler: authenticate, schema: { tags: ['pilot'], body: z.object({ name: z.string(), practices: z.array(z.enum(PRACTICES)).min(1) }) } },
    async (req) => {
      const user = getUser(req);
      assertRole(user, 'bd');
      const body = req.body as { name: string; practices: (typeof PRACTICES)[number][] };
      return startPilot(app.db, { firmId: user.firmId, name: body.name, practices: body.practices });
    },
  );

  app.get('/v1/pilots/:id', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    return getPilot(app.db, getUser(req).firmId, (req.params as { id: string }).id);
  });

  app.post('/v1/pilots/:id/weeks/:week/roll', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid(), week: z.coerce.number().int().min(1).max(8) }) } }, async (req) => {
    const user = getUser(req);
    const params = req.params as { id: string; week: number };
    return rollWeek(app.db, user.firmId, params.id, params.week);
  });

  app.post('/v1/pilots/:id/scorecard', { preHandler: authenticate, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const user = getUser(req);
    assertRole(user, 'bd');
    return buildScorecard(app.db, user.firmId, (req.params as { id: string }).id);
  });

  app.get('/v1/activity', { preHandler: authenticate }, async (req) => {
    return { items: await listActivity(app.db, getUser(req).firmId) };
  });

  app.get('/v1/activity/stream', { preHandler: authenticate }, async (req, reply) => {
    const user = getUser(req);
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = (event: unknown) => {
      const row = event as { firmId?: string | null };
      if (row.firmId && row.firmId !== user.firmId) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    activityBus.on('event', send);
    req.raw.on('close', () => activityBus.off('event', send));
  });

  app.post('/v1/admin/ingest/:sourceId', { preHandler: authenticate, schema: { tags: ['admin'], params: z.object({ sourceId: z.string() }) } }, async (req) => {
    const user = getUser(req);
    if (!hasRole(user, 'admin')) throw forbidden();
    return ingestSource(app.db, (req.params as { sourceId: string }).sourceId);
  });

  app.post('/v1/admin/process/:recordId', { preHandler: authenticate, schema: { tags: ['admin'], params: z.object({ recordId: z.string().uuid() }) } }, async (req) => {
    const user = getUser(req);
    if (!hasRole(user, 'admin')) throw forbidden();
    return processRecord(app.db, (req.params as { recordId: string }).recordId);
  });

  app.get('/v1/admin/swarm-calls', { preHandler: authenticate }, async (req) => {
    const user = getUser(req);
    if (!hasRole(user, 'admin')) throw forbidden();
    const items = await app.db.select().from(swarmCalls).orderBy(desc(swarmCalls.createdAt)).limit(50);
    return { items };
  });

  app.post('/v1/webhooks/deep-swarm', async (req, reply) => {
    const cfg = getConfig();
    const signature = String(req.headers['x-deep-swarm-signature'] ?? '');
    const payload = JSON.stringify(req.body ?? {});
    const expected = createHmac('sha256', cfg.DEEP_SWARM_WEBHOOK_SECRET).update(payload).digest('hex');
    const valid = signature === expected || signature === `sha256=${expected}`;
    await app.db.insert(webhookInbox).values({
      provider: 'deepswarm',
      remoteId: (req.body as { id?: string } | null)?.id ?? null,
      signatureValid: valid,
      payload: req.body,
    });
    if (!valid) return reply.code(401).send({ error: 'invalid_signature' });
    return { ok: true };
  });

  void USER_ROLES;
}
