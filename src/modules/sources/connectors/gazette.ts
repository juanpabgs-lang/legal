import { fetchJson } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

interface GazetteResponse {
  'f:entry'?: unknown;
  entry?: Array<{
    id?: string;
    title?: string;
    updated?: string;
    'f:notice-code'?: string;
    content?: string;
    link?: Array<{ href?: string }>;
  }>;
}

export const gazetteConnector: Connector = {
  id: 'gazette',
  async fetch() {
    const data = await fetchJson<GazetteResponse>(
      'https://www.thegazette.co.uk/insolvency/notice/data.json?results-page-size=20',
    );
    const entries = Array.isArray(data.entry) ? data.entry : [];
    const records: NormalizedRecord[] = entries.map((entry) => ({
      externalId: String(entry.id ?? entry.title),
      publishedAt: new Date(entry.updated ?? Date.now()),
      title: String(entry.title ?? 'Gazette insolvency notice'),
      summary: entry['f:notice-code'] ?? null,
      body: typeof entry.content === 'string' ? entry.content : null,
      url: entry.link?.[0]?.href ?? (entry.id ? String(entry.id) : null),
      language: 'en',
      market: 'UK',
      kind: 'insolvency',
      raw: entry as Record<string, unknown>,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
