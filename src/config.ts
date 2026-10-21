import { z } from 'zod';

const swarmProvider = z.enum(['simulated', 'deepswarm']).default('simulated');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().default('postgres://norfront:norfront@localhost:5432/norfront'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  JWT_SECRET: z.string().min(16).default('norfront-dev-jwt-secret-change-me'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 12),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default('admin@norfront.local'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).default('norfront-admin'),
  USER_AGENT: z.string().default('Norfront/0.1 (research; contact@norfront.local)'),
  SWARM_DETECT: swarmProvider,
  SWARM_PREDICT: swarmProvider,
  SWARM_DRAFT: swarmProvider,
  SWARM_FALLBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DEEP_SWARM_BASE_URL: z.string().optional(),
  DEEP_SWARM_API_KEY: z.string().optional(),
  DEEP_SWARM_WEBHOOK_SECRET: z.string().default('norfront-dev-webhook-secret'),
  DEEP_SWARM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  DEEP_SWARM_MODE: z.enum(['sync', 'async']).default('sync'),
  COMPANIES_HOUSE_API_KEY: z.string().optional(),
  SAM_GOV_API_KEY: z.string().optional(),
  COURTLISTENER_TOKEN: z.string().optional(),
  MAIL_PROVIDER: z.enum(['test', 'smtp', 'gmail', 'microsoft']).default('test'),
  SMTP_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MAIL_FROM: z.string().default('partners@norfront.local'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  INGEST_LOOKBACK_DAYS: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  SKIP_ENQUEUE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}

export function getConfig(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetConfig(env?: NodeJS.ProcessEnv): Config {
  cached = loadConfig(env ?? process.env);
  return cached;
}
