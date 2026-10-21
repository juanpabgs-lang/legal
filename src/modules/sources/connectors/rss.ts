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
        const published = parseLooseDate(row.pubDate ?? row.updated ?? row.published);
        const summary = stringifyField(row.description ?? row.summary);
        return {
          externalId: stringifyField(id) || title,
          publishedAt: published,
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

function stringifyField(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value && '#text' in value) return String((value as { '#text'?: unknown })['#text'] ?? '');
  return '';
}

function parseLooseDate(value: unknown): Date {
  const raw = stringifyField(value) || String(value ?? '');
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}
