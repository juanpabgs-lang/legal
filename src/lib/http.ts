import { getConfig } from '../config';
import { unavailable } from './errors';

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: string;
  expected?: number[];
}

export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<{ status: number; text: string; headers: Headers }> {
  const cfg = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'user-agent': cfg.USER_AGENT,
        accept: 'application/json, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
        ...options.headers,
      },
      body: options.body,
      signal: controller.signal,
    });
    const text = await res.text();
    const expected = options.expected ?? [200, 201, 202, 204, 304];
    if (!expected.includes(res.status) && res.status >= 400) {
      throw unavailable(`Upstream ${res.status} from ${url}`, { status: res.status, body: text.slice(0, 400) });
    }
    return { status: res.status, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { text, status } = await fetchText(url, options);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw unavailable(`Upstream ${status} returned non-JSON from ${url}`, { body: text.slice(0, 200) });
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
