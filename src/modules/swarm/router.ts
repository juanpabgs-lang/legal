import { getConfig, type Config } from '../../config';
import type { Database } from '../../db/client';
import { swarmCalls } from '../../db/schema';
import { logger } from '../../lib/logger';
import { uuid } from '../../lib/ids';
import {
  detectInputSchema,
  detectOutputSchema,
  draftInputSchema,
  draftOutputSchema,
  predictInputSchema,
  predictOutputSchema,
  type DetectInput,
  type DetectOutput,
  type DraftInput,
  type DraftOutput,
  type PredictInput,
  type PredictOutput,
  type SwarmProvider,
  type SwarmTask,
} from './contracts';
import { DeepSwarmClient } from './deepswarm/client';
import { simulatedSwarm } from './simulated';

export type ProviderName = 'simulated' | 'deepswarm';

export function providerFor(task: SwarmTask, cfg: Config = getConfig()): ProviderName {
  if (task === 'detect') return cfg.SWARM_DETECT;
  if (task === 'predict') return cfg.SWARM_PREDICT;
  if (task === 'draft') return cfg.SWARM_DRAFT;
  return 'simulated';
}

export function getProvider(name: ProviderName): SwarmProvider {
  if (name === 'deepswarm') return new DeepSwarmClient();
  return simulatedSwarm;
}

export async function runDetect(db: Database, input: DetectInput, firmId?: string): Promise<DetectOutput> {
  const parsed = detectInputSchema.parse(input);
  const output = await invoke(db, 'detect', parsed, (p) => p.detect(parsed), detectOutputSchema.parse, firmId);
  return output;
}

export async function runPredict(db: Database, input: PredictInput, firmId?: string): Promise<PredictOutput> {
  const parsed = predictInputSchema.parse(input);
  return invoke(db, 'predict', parsed, (p) => p.predict(parsed), predictOutputSchema.parse, firmId);
}

export async function runDraft(db: Database, input: DraftInput, firmId?: string): Promise<DraftOutput> {
  const parsed = draftInputSchema.parse(input);
  return invoke(db, 'draft', parsed, (p) => p.draft(parsed), draftOutputSchema.parse, firmId);
}

async function invoke<I, O>(
  db: Database,
  task: SwarmTask,
  input: I,
  call: (provider: SwarmProvider) => Promise<O>,
  parse: (value: unknown) => O,
  firmId?: string,
): Promise<O> {
  const cfg = getConfig();
  const primaryName = providerFor(task, cfg);
  const idempotencyKey = `${task}:${hashish(input)}`;
  const started = Date.now();
  try {
    const output = parse(await call(getProvider(primaryName)));
    await logCall(db, {
      task,
      provider: primaryName,
      status: 'ok',
      idempotencyKey,
      input,
      output,
      latencyMs: Date.now() - started,
      firmId,
    });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, task, provider: primaryName }, 'swarm provider failed');
    if (cfg.SWARM_FALLBACK && primaryName !== 'simulated') {
      const output = parse(await call(simulatedSwarm));
      await logCall(db, {
        task,
        provider: 'simulated',
        status: 'fallback',
        idempotencyKey,
        input,
        output,
        error: message,
        latencyMs: Date.now() - started,
        firmId,
      });
      return output;
    }
    await logCall(db, {
      task,
      provider: primaryName,
      status: 'error',
      idempotencyKey,
      input,
      error: message,
      latencyMs: Date.now() - started,
      firmId,
    });
    throw err;
  }
}

function hashish(value: unknown): string {
  const json = JSON.stringify(value);
  let h = 0;
  for (let i = 0; i < json.length; i += 1) h = (Math.imul(31, h) + json.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(16)}:${json.length}`;
}

async function logCall(
  db: Database,
  row: {
    task: string;
    provider: string;
    status: 'ok' | 'error' | 'fallback' | 'pending';
    idempotencyKey: string;
    input: unknown;
    output?: unknown;
    error?: string;
    latencyMs: number;
    firmId?: string;
  },
): Promise<void> {
  await db.insert(swarmCalls).values({
    id: uuid(),
    task: row.task,
    provider: row.provider,
    status: row.status,
    idempotencyKey: `${row.idempotencyKey}:${row.provider}:${Date.now()}`,
    input: row.input,
    output: row.output,
    error: row.error,
    latencyMs: row.latencyMs,
    firmId: row.firmId,
  });
}
