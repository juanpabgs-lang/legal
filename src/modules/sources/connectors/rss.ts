import { XMLParser } from 'fast-xml-parser';
import type { Source } from '../../../db/schema';
import { fetchText } from '../../../lib/http';
import { marketLanguage } from '../../../domain/taxonomy';
import type { Connector, NormalizedRecord } from '../types';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export function rssConnector(source: Source): Connector {
  return {
    id: source.id,
    async fetch() {
      const feedUrl = source.homeUrl ?? '';
      const { text } = await fetchText(feedUrl);
      const parsed = parser.parse(text) as {
        rss?: { channel?: { item?: unknown } };
        feed?: { entry?: unknown };
      };
      const items = asArray(parsed.rss?.channel?.item ?? parsed.feed?.entry);
      const records: NormalizedRecord[] = items.slice(0, 20).map((item) => {
        const row = item as Record<string, unknown>;
        const title = String(row.title ?? source.name);
        const link = typeof row.link === 'string' ? row.link : (row.link as { href?: string } | undefined)?.href;
        const id = String(row.guid ?? row.id ?? link ?? title);
        const published = String(row.pubDate ?? row.updated ?? row.published ?? Date.now());
        const summary = String(row.description ?? row.summary ?? '');
        return {
          externalId: id,
          publishedAt: new Date(published),
          title,
          summary,
          body: summary,
          url: link ?? null,
          language: marketLanguage(source.market),
          market: source.market,
          kind: source.kind,
          raw: row,
        };
      });
      return { records, cursor: { fetchedAt: new Date().toISOString() } };
    },
  };
}

function asArray(value: unknown): unknown[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
