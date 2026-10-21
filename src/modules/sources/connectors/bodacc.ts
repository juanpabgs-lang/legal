import { fetchJson } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

interface BodaccResponse {
  results?: Array<{
    id?: string;
    numeroannonce?: string;
    publicationavis?: string;
    dateparution?: string;
    familleavis_lib?: string;
    typeavis_lib?: string;
    commerçant?: string;
    denomination?: string;
    registre?: string;
    url_complete?: string;
    tribunal?: string;
  }>;
}

export const bodaccConnector: Connector = {
  id: 'bodacc',
  async fetch() {
    const url =
      'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?limit=20&order_by=dateparution%20desc';
    const data = await fetchJson<BodaccResponse>(url);
    const records: NormalizedRecord[] = (data.results ?? []).map((row) => ({
      externalId: String(row.id ?? row.numeroannonce ?? row.denomination),
      publishedAt: new Date(row.dateparution ?? Date.now()),
      title: `${row.familleavis_lib ?? 'BODACC'} — ${row.denomination ?? row.commerçant ?? 'société'}`,
      summary: row.typeavis_lib ?? null,
      body: [row.typeavis_lib, row.tribunal, row.registre].filter(Boolean).join(' · '),
      url: row.url_complete ?? null,
      language: 'fr',
      market: 'FR',
      kind: 'insolvency',
      raw: row,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
