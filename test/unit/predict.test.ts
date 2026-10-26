import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../../src/modules/swarm/contracts';
import { predictSimulated } from '../../src/modules/swarm/simulated/predict';

describe('predictSimulated', () => {
  it('scores a distributor hit by a customer insolvency, a named claim and new security', () => {
    const out = predictSimulated({
      version: CONTRACT_VERSION,
      task: 'predict',
      asOf: '2026-03-07T00:00:00Z',
      company: {
        id: 'nb',
        name: 'Northbridge Foods Ltd',
        market: 'UK',
        sector: 'food-distribution',
        employeeCount: 80,
        identifiers: [],
      },
      signals: [
        {
          id: 's1',
          type: 'insolvency.creditor_named',
          publishedAt: '2026-03-03T00:00:00Z',
          recordId: 'r2',
          sourceId: 'seed',
          subjectCompanyId: 'nb',
          relatedCompanyId: 'mg',
          confidence: 0.9,
          payload: {},
        },
        {
          id: 's2',
          type: 'finance.security_registered',
          publishedAt: '2026-03-07T00:00:00Z',
          recordId: 'r3',
          sourceId: 'seed',
          subjectCompanyId: 'nb',
          relatedCompanyId: 'rb',
          confidence: 0.9,
          payload: {},
        },
      ],
      relationships: [],
      exposures: [
        {
          role: 'supplier',
          practice: 'commercial',
          eventCompanyName: 'Meridian Grocers plc',
          eventType: 'insolvency.proceedings_opened',
        },
        {
          role: 'creditor',
          practice: 'insolvency',
          eventCompanyName: 'Meridian Grocers plc',
          eventType: 'insolvency.proceedings_opened',
        },
      ],
    });
    const practices = out.scores.map((s) => s.practice);
    expect(practices).toEqual(expect.arrayContaining(['insolvency', 'commercial', 'banking']));
    const insolvency = out.scores.find((s) => s.practice === 'insolvency')!;
    expect(insolvency.confidence).toBe('high');
    expect(insolvency.windowMinDays).toBe(14);
    expect(insolvency.windowMaxDays).toBe(28);
  });
});
