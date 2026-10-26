import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetConfig } from '../../src/config';
import { CONTRACT_VERSION } from '../../src/modules/swarm/contracts';
import { DeepSwarmClient } from '../../src/modules/swarm/deepswarm/client';
import { buildMockDeepSwarm } from '../../src/modules/swarm/mock-server';

describe('Deep Swarm contract', () => {
  let app: Awaited<ReturnType<typeof buildMockDeepSwarm>>;
  let url: string;

  beforeAll(async () => {
    app = await buildMockDeepSwarm({ apiKey: 'contract-key' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    url = `http://127.0.0.1:${port}`;
    process.env.DEEP_SWARM_CONTRACT_MODE = 'identity';
    resetConfig({
      ...process.env,
      NODE_ENV: 'test',
      DEEP_SWARM_BASE_URL: url,
      DEEP_SWARM_API_KEY: 'contract-key',
      DEEP_SWARM_CONTRACT_MODE: 'identity',
      DEEP_SWARM_MODE: 'sync',
    });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DEEP_SWARM_CONTRACT_MODE;
  });

  it('rejects a bad API key', async () => {
    const client = new DeepSwarmClient(url, 'wrong', 5_000, 'sync');
    await expect(
      client.detect({
        version: CONTRACT_VERSION,
        task: 'detect',
        record: {
          id: 'r',
          sourceId: 'seed',
          sourceName: 'seed',
          kind: 'press',
          market: 'UK',
          language: 'en',
          title: 'Hello',
          summary: null,
          body: null,
          url: null,
          publishedAt: new Date().toISOString(),
          extracted: { mentions: [{ ref: 'c', kind: 'company', name: 'Acme' }] },
        },
      }),
    ).rejects.toThrow();
  });

  it('round-trips detect through identity mapping', async () => {
    const client = new DeepSwarmClient(url, 'contract-key', 5_000, 'sync');
    const out = await client.detect({
      version: CONTRACT_VERSION,
      task: 'detect',
      record: {
        id: 'r',
        sourceId: 'uk-gazette',
        sourceName: 'Gazette',
        kind: 'insolvency',
        market: 'UK',
        language: 'en',
        title: 'Acme Ltd entered administration',
        summary: 'Administrator appointed',
        body: 'The company entered administration.',
        url: null,
        publishedAt: new Date().toISOString(),
        extracted: { mentions: [{ ref: 'c', kind: 'company', name: 'Acme Ltd' }] },
      },
    });
    expect(out.task).toBe('detect');
    expect(out.signals.length).toBeGreaterThan(0);
  });
});
