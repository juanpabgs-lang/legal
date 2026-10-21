import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export const placspConnector: Connector = {
  id: 'placsp',
  async fetch() {
    const { text } = await fetchText(
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
    );
    const parsed = parser.parse(text) as { feed?: { entry?: unknown } };
    const entries = Array.isArray(parsed.feed?.entry) ? parsed.feed.entry : parsed.feed?.entry ? [parsed.feed.entry] : [];
    const records: NormalizedRecord[] = (entries as Array<Record<string, unknown>>).slice(0, 15).map((entry) => {
      const title = String(entry.title ?? 'Licitación');
      const id = String(entry.id ?? title);
      const link = entry.link as { href?: string } | Array<{ href?: string }> | undefined;
      const href = Array.isArray(link) ? link[0]?.href : link?.href;
      return {
        externalId: id,
        publishedAt: new Date(String(entry.updated ?? entry.published ?? Date.now())),
        title,
        summary: typeof entry.summary === 'string' ? entry.summary : null,
        body: typeof entry.summary === 'string' ? entry.summary : null,
        url: href ?? null,
        language: 'es',
        market: 'ES',
        kind: 'tender',
        raw: entry,
      };
    });
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
