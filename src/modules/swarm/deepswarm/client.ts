import { getConfig } from '../../../config';
import { unavailable } from '../../../lib/errors';
import { fetchJson, fetchText, sleep } from '../../../lib/http';
import type { DetectInput, DetectOutput, DraftInput, DraftOutput, PredictInput, PredictOutput, SwarmProvider } from '../contracts';
import { mapping } from './mapping';

interface JobEnvelope {
  id?: string;
  jobId?: string;
  status?: string;
  result?: unknown;
  output?: unknown;
}

export class DeepSwarmClient implements SwarmProvider {
  readonly name = 'deepswarm';

  constructor(
    private readonly baseUrl = getConfig().DEEP_SWARM_BASE_URL,
    private readonly apiKey = getConfig().DEEP_SWARM_API_KEY,
    private readonly timeoutMs = getConfig().DEEP_SWARM_TIMEOUT_MS,
    private readonly mode = getConfig().DEEP_SWARM_MODE,
  ) {}

  async detect(input: DetectInput): Promise<DetectOutput> {
    const raw = await this.call('detect', mapping.toDetectRequest(input));
    return mapping.fromDetectResponse(raw);
  }

  async predict(input: PredictInput): Promise<PredictOutput> {
    const raw = await this.call('predict', mapping.toPredictRequest(input));
    return mapping.fromPredictResponse(raw);
  }

  async draft(input: DraftInput): Promise<DraftOutput> {
    const raw = await this.call('draft', mapping.toDraftRequest(input));
    return mapping.fromDraftResponse(raw);
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) throw unavailable('DEEP_SWARM_API_KEY is not set');
    return {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    };
  }

  private endpoint(task: string): string {
    if (!this.baseUrl) throw unavailable('DEEP_SWARM_BASE_URL is not set');
    return `${this.baseUrl.replace(/\/$/, '')}/v1/tasks/${task}`;
  }

  private async call(task: string, body: unknown): Promise<unknown> {
    const url = this.endpoint(task);
    const payload = JSON.stringify(body);
    if (this.mode === 'sync') {
      return fetchJson<unknown>(url, {
        method: 'POST',
        headers: this.headers(),
        body: payload,
        timeoutMs: this.timeoutMs,
      });
    }
    const created = await fetchJson<JobEnvelope>(url, {
      method: 'POST',
      headers: { ...this.headers(), prefer: 'respond-async' },
      body: payload,
      timeoutMs: this.timeoutMs,
      expected: [200, 201, 202],
    });
    const jobId = created.id ?? created.jobId;
    if (!jobId) throw unavailable('Deep Swarm async job did not return an id');
    return this.poll(jobId);
  }

  private async poll(jobId: string): Promise<unknown> {
    const base = this.baseUrl!.replace(/\/$/, '');
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const job = await fetchJson<JobEnvelope>(`${base}/v1/jobs/${jobId}`, {
        headers: this.headers(),
        timeoutMs: 10_000,
      });
      if (job.status === 'succeeded' || job.status === 'ok' || job.result || job.output) {
        return job.result ?? job.output ?? job;
      }
      if (job.status === 'failed' || job.status === 'error') {
        throw unavailable(`Deep Swarm job ${jobId} failed`);
      }
      await sleep(750);
    }
    throw unavailable(`Deep Swarm job ${jobId} timed out`);
  }

  async ping(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const { status } = await fetchText(`${this.baseUrl.replace(/\/$/, '')}/health`, {
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        expected: [200, 204],
      });
      return status < 400;
    } catch {
      return false;
    }
  }
}

export const deepSwarmClient = new DeepSwarmClient();
