import { fetchJson } from '../../../lib/http';
import type { Connector, NormalizedRecord } from '../types';

interface OcdsPackage {
  releases?: Array<{
    id?: string;
    ocid?: string;
    date?: string;
    tender?: { title?: string; description?: string };
    awards?: Array<{ title?: string; suppliers?: Array<{ name?: string }> }>;
  }>;
}

export const findATenderConnector: Connector = {
  id: 'find-a-tender',
  async fetch() {
    const data = await fetchJson<{ releases?: OcdsPackage['releases'] } | OcdsPackage>(
      'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=10',
    );
    const releases = 'releases' in data && Array.isArray(data.releases) ? data.releases : [];
    const records: NormalizedRecord[] = releases.slice(0, 15).map((rel) => ({
      externalId: String(rel.id ?? rel.ocid ?? rel.tender?.title),
      publishedAt: new Date(rel.date ?? Date.now()),
      title: rel.tender?.title ?? rel.awards?.[0]?.title ?? 'Find a Tender release',
      summary: rel.tender?.description ?? null,
      body: rel.tender?.description ?? null,
      url: rel.ocid ? `https://www.find-tender.service.gov.uk/Search/Results?ocid=${rel.ocid}` : null,
      language: 'en',
      market: 'UK',
      kind: 'tender',
      raw: rel as Record<string, unknown>,
    }));
    return { records, cursor: { fetchedAt: new Date().toISOString() } };
  },
};
