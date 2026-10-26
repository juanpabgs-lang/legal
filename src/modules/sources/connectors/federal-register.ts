import { fetchJson } from '../../../lib/http';
import { addDays } from '../../../lib/time';
import type { Connector, NormalizedRecord } from '../types';

interface FrResponse {
  results?: Array<{
    document_number: string;
    title: string;
    abstract?: string;
    html_url?: string;
    publication_date?: string;
    type?: string;
  }>;
}

export const federalRegisterConnector: Connector = {
  id: 'federal-register',
  async fetch(ctx) {
    const since = addDays(new Date(), -ctx.lookbackDays).toISOString().slice(0, 10);
    const url = `https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions[publication_date][gte]=${since}&conditions[type][]=PRORULE`;
    const data = await fetchJson<FrResponse>(url);
    const records: NormalizedRecord[] = (data.results ?? []).map((doc) => ({
      externalId: doc.document_number,
      publishedAt: new Date(doc.publication_date ?? Date.now()),
      title: doc.title,
      summary: doc.abstract ?? null,
      body: doc.abstract ?? null,
      url: doc.html_url ?? null,
      language: 'en',
      market: 'US',
      kind: 'legislation',
      raw: doc,
    }));
    return { records, cursor: { since } };
  },
};
