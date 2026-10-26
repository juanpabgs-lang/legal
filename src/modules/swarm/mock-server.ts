import Fastify from 'fastify';
import { detectSimulated } from './simulated/detect';
import { draftSimulated } from './simulated/draft';
import { predictSimulated } from './simulated/predict';
import type { DetectInput, DraftInput, PredictInput } from './contracts';

/**
 * HTTP stand-in for Deep Swarm. Speaks the contract we expect tomorrow so the
 * client, retries, async jobs and webhook path can be tested now.
 */
export async function buildMockDeepSwarm(options: { apiKey: string; async?: boolean; fail?: boolean } = { apiKey: 'test-key' }) {
  const app = Fastify({ logger: false });
  const jobs = new Map<string, { status: string; result?: unknown }>();

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${options.apiKey}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/health', async () => ({ ok: true }));

  const handle = (task: string, impl: (body: never) => unknown) => {
    app.post(`/v1/tasks/${task}`, async (req, reply) => {
      if (options.fail) return reply.code(500).send({ error: 'injected_failure' });
      const result = impl(req.body as never);
      if (options.async) {
        const id = `${task}-${jobs.size + 1}`;
        jobs.set(id, { status: 'queued' });
        setTimeout(() => jobs.set(id, { status: 'succeeded', result }), 20);
        return reply.code(202).send({ id, status: 'queued' });
      }
      return result;
    });
  };

  handle('detect', (body: DetectInput) => detectSimulated(body));
  handle('predict', (body: PredictInput) => predictSimulated(body));
  handle('draft', (body: DraftInput) => draftSimulated(body));

  app.get('/v1/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = jobs.get(id);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    return job;
  });

  return app;
}

export async function startMockDeepSwarm(port = 4173) {
  const app = await buildMockDeepSwarm({ apiKey: process.env.DEEP_SWARM_API_KEY ?? 'test-key' });
  await app.listen({ port, host: '127.0.0.1' });
  return app;
}
