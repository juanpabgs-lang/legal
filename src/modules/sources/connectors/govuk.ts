import { fetchJson } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

interface GovItem {
  title?: string;
  link?: string;
  description?: string;
  public_timestamp?: string;
  content_id?: string;
}

async function search(filter: string): Promise<GovItem[]> {
  const data = await fetchJson<{ results?: GovItem[] }>(
    `https://www.gov.uk/api/search.json?${filter}&count=10`,
  );
  return data.results ?? [];
}

export const govukConnector: Connector = {
  id: 'govuk',
  async fetch() {
    const [consultations, cases] = await Promise.all([
      search('filter_content_store_document_type=open_consultation'),
      search('filter_format=cma_case'),
    ]);
    const records: NormalizedRecord[] = [...consultations, ...cases].map((item) => ({
      externalId: item.content_id ?? item.link ?? item.title ?? 'govuk',
      publishedAt: new Date(item.public_timestamp ?? Date.now()),
      title: item.title ?? 'GOV.UK document',
      summary: item.description ?? null,
      body: item.description ?? null,
      url: item.link ? `https://www.gov.uk${item.link}` : null,
      language: 'en',
      market: 'UK',
      kind: 'regulator',
      raw: item as Record<string, unknown>,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
