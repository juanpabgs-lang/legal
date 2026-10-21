import { fetchJson } from '../../../lib/http';
import { isoDate } from '../../../lib/time';
import type { Connector, NormalizedRecord } from '../types';

export const bormeConnector: Connector = {
  id: 'borme',
  async fetch() {
    const day = lastWeekday(new Date());
    const ymd = isoDate(day).replaceAll('-', '');
    const data = await fetchJson<{
      status?: { code?: string };
      data?: { sumario?: { diario?: unknown } };
    }>(`https://www.boe.es/datosabiertos/api/borme/sumario/${ymd}`, {
      headers: { accept: 'application/json' },
      expected: [200, 400, 404],
    });
    const records: NormalizedRecord[] = [
      {
        externalId: `borme-sumario-${ymd}`,
        publishedAt: day,
        title: `BORME sumario ${ymd}`,
        summary: data.status?.code === '200' ? 'Daily companies-register acts' : 'No BORME edition for this date',
        body: JSON.stringify(data.data?.sumario ?? {}).slice(0, 4000),
        url: `https://www.boe.es/diario_borme/fecha.php?d=${ymd.slice(6, 8)}&m=${ymd.slice(4, 6)}&y=${ymd.slice(0, 4)}`,
        language: 'es',
        market: 'ES',
        kind: 'registry',
        raw: data as Record<string, unknown>,
      },
    ];
    return { records, cursor: { ymd } };
  },
};

function lastWeekday(from: Date): Date {
  const d = new Date(from);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
