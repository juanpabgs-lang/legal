import { getConfig } from '../../../config';
import { fetchJson } from '../../../lib/http';
import { unavailable } from '../../../lib/errors';
import type { Connector, NormalizedRecord } from '../types';

export const companiesHouseConnector: Connector = {
  id: 'companies-house',
  async fetch() {
    const key = getConfig().COMPANIES_HOUSE_API_KEY;
    if (!key) throw unavailable('COMPANIES_HOUSE_API_KEY is not set');
    const auth = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
    const data = await fetchJson<{ items?: Array<{ company_number?: string; date?: string; description?: string; type?: string }> }>(
      'https://api.company-information.service.gov.uk/filings?items_per_page=20',
      { headers: { authorization: auth }, expected: [200, 401, 403] },
    );
    const records: NormalizedRecord[] = (data.items ?? []).map((item) => ({
      externalId: `${item.company_number ?? 'unknown'}:${item.date ?? ''}:${item.type ?? ''}`,
      publishedAt: new Date(item.date ?? Date.now()),
      title: item.description ?? 'Companies House filing',
      summary: item.type ?? null,
      body: item.description ?? null,
      url: item.company_number
        ? `https://find-and-update.company-information.service.gov.uk/company/${item.company_number}`
        : null,
      language: 'en',
      market: 'UK',
      kind: 'registry',
      raw: item,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
