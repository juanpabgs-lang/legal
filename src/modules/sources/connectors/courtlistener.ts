import { getConfig } from '../../../config';
import { fetchJson } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

interface ClResponse {
  results?: Array<{
    id?: number | string;
    caseName?: string;
    caseNameFull?: string;
    docketNumber?: string;
    dateFiled?: string;
    absolute_url?: string;
    snippet?: string;
  }>;
}

export const courtlistenerConnector: Connector = {
  id: 'courtlistener',
  async fetch() {
    const cfg = getConfig();
    const headers: Record<string, string> = {};
    if (cfg.COURTLISTENER_TOKEN) headers.authorization = `Token ${cfg.COURTLISTENER_TOKEN}`;
    const data = await fetchJson<ClResponse>(
      'https://www.courtlistener.com/api/rest/v4/search/?q=bankruptcy&type=d&order_by=dateFiled+desc',
      { headers },
    );
    const records: NormalizedRecord[] = (data.results ?? []).slice(0, 20).map((item) => ({
      externalId: String(item.id ?? item.docketNumber ?? item.caseName),
      publishedAt: new Date(item.dateFiled ?? Date.now()),
      title: item.caseNameFull ?? item.caseName ?? 'CourtListener docket',
      summary: item.snippet ?? item.docketNumber ?? null,
      body: item.snippet ?? null,
      url: item.absolute_url ? `https://www.courtlistener.com${item.absolute_url}` : null,
      language: 'en',
      market: 'US',
      kind: 'court',
      raw: item,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
