import { describe, expect, it } from 'vitest';
import { isCompliant } from '../../src/modules/outreach/compliance';

describe('isCompliant', () => {
  it('fails when any rule failed', () => {
    expect(isCompliant([{ ruleId: null, kind: 'x', passed: true, message: 'ok' }])).toBe(true);
    expect(
      isCompliant([
        { ruleId: null, kind: 'x', passed: true, message: 'ok' },
        { ruleId: null, kind: 'y', passed: false, message: 'no' },
      ]),
    ).toBe(false);
  });
});
