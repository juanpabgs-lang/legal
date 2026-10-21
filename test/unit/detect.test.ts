import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../../src/modules/swarm/contracts';
import { detectSimulated } from '../../src/modules/swarm/simulated/detect';

describe('detectSimulated', () => {
  it('classifies an administration notice', () => {
    const out = detectSimulated({
      version: CONTRACT_VERSION,
      task: 'detect',
      record: {
        id: 'r1',
        sourceId: 'uk-gazette',
        sourceName: 'The Gazette',
        kind: 'insolvency',
        market: 'UK',
        language: 'en',
        title: 'Meridian Grocers plc entered administration',
        summary: 'Administrator appointed',
        body: 'The company entered administration.',
        url: null,
        publishedAt: new Date().toISOString(),
        extracted: {
          mentions: [{ ref: 'm', kind: 'company', name: 'Meridian Grocers plc' }],
        },
      },
    });
    expect(out.signals.map((s) => s.type)).toContain('insolvency.proceedings_opened');
  });
});
