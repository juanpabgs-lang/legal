import { fetchJson } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

interface BoampResponse {
  results?: Array<{
    idweb?: string;
    objet?: string;
    nomacheteur?: string;
    dateparution?: string;
    typeavis?: string;
    url_avis?: string;
  }>;
}

export const boampConnector: Connector = {
  id: 'boamp',
  async fetch() {
    const data = await fetchJson<BoampResponse>(
      'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?limit=15&order_by=dateparution%20desc',
    );
    const records: NormalizedRecord[] = (data.results ?? []).map((row) => ({
      externalId: String(row.idweb ?? row.objet),
      publishedAt: new Date(row.dateparution ?? Date.now()),
      title: row.objet ?? 'Avis BOAMP',
      summary: row.nomacheteur ?? null,
      body: [row.typeavis, row.nomacheteur].filter(Boolean).join(' · '),
      url: row.url_avis ?? null,
      language: 'fr',
      market: 'FR',
      kind: 'tender',
      raw: row,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
