import { fetchJson } from '../../../lib/http';
import { isoDate } from '../../../lib/time';
import type { Connector } from '../types';

export const boeConnector: Connector = {
  id: 'boe',
  async fetch() {
    const day = new Date();
    const ymd = isoDate(day).replaceAll('-', '');
    const data = await fetchJson<{ status?: { code?: string }; data?: unknown }>(
      `https://www.boe.es/datosabiertos/api/boe/sumario/${ymd}`,
      { headers: { accept: 'application/json' }, expected: [200, 400, 404] },
    );
    return {
      records: [
        {
          externalId: `boe-sumario-${ymd}`,
          publishedAt: day,
          title: `BOE sumario ${ymd}`,
          summary: 'Official state gazette, including concurso notices and draft rules',
          body: JSON.stringify(data.data ?? {}).slice(0, 4000),
          url: `https://www.boe.es/boe/dias/${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}/`,
          language: 'es',
          market: 'ES',
          kind: 'insolvency',
          raw: data as Record<string, unknown>,
        },
      ],
      cursor: { ymd },
    };
  },
};
