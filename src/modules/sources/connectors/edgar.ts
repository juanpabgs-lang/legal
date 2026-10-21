import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export const edgarConnector: Connector = {
  id: 'edgar',
  async fetch() {
    const { text } = await fetchText(
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom&count=40',
    );
    const parsed = parser.parse(text) as { feed?: { entry?: unknown } };
    const entries = asArray(parsed.feed?.entry);
    const records: NormalizedRecord[] = entries.map((entry) => {
      const item = entry as {
        title?: string;
        id?: string;
        updated?: string;
        link?: { href?: string } | Array<{ href?: string }>;
        summary?: { '#text'?: string } | string;
      };
      const link = Array.isArray(item.link) ? item.link[0]?.href : item.link?.href;
      const summary = typeof item.summary === 'string' ? item.summary : item.summary?.['#text'];
      return {
        externalId: String(item.id ?? link ?? item.title),
        publishedAt: new Date(item.updated ?? Date.now()),
        title: String(item.title ?? 'EDGAR 8-K'),
        summary: summary ?? null,
        body: summary ?? null,
        url: link ?? null,
        language: 'en',
        market: 'US',
        kind: 'registry',
        raw: item as Record<string, unknown>,
      };
    });
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
