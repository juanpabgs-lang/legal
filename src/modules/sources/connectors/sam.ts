import { getConfig } from '../../../config';
import { fetchJson } from '../../../lib/http';
import { unavailable } from '../../../lib/errors';
import { addDays, isoDate } from '../../../lib/time';
import type { Connector, NormalizedRecord } from '../types';

export const samConnector: Connector = {
  id: 'sam',
  async fetch(ctx) {
    const key = getConfig().SAM_GOV_API_KEY;
    if (!key) throw unavailable('SAM_GOV_API_KEY is not set');
    const postedFrom = isoDate(addDays(new Date(), -ctx.lookbackDays));
    const postedTo = isoDate(new Date());
    const data = await fetchJson<{
      opportunitiesData?: Array<{ noticeId?: string; title?: string; postedDate?: string; uiLink?: string; description?: string }>;
    }>(
      `https://api.sam.gov/opportunities/v2/search?limit=10&postedFrom=${postedFrom}&postedTo=${postedTo}&api_key=${encodeURIComponent(key)}`,
    );
    const records: NormalizedRecord[] = (data.opportunitiesData ?? []).map((item) => ({
      externalId: item.noticeId ?? item.title ?? 'sam',
      publishedAt: new Date(item.postedDate ?? Date.now()),
      title: item.title ?? 'SAM.gov opportunity',
      summary: item.description ?? null,
      body: item.description ?? null,
      url: item.uiLink ?? null,
      language: 'en',
      market: 'US',
      kind: 'tender',
      raw: item,
    }));
    return { records, cursor: { postedFrom } };
  },
};
