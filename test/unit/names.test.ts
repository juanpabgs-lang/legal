import { describe, expect, it } from 'vitest';
import { dice, namesMatch, normalizeName } from '../../src/lib/names';

describe('normalizeName', () => {
  it('strips legal suffixes and diacritics', () => {
    expect(normalizeName('Société Générale SA')).toBe('societe generale');
    expect(normalizeName('Northbridge Foods Ltd')).toBe('northbridge foods');
  });

  it('matches close registry names', () => {
    expect(namesMatch('Northbridge Foods Limited', 'Northbridge Foods Ltd')).toBe(true);
    expect(dice('Meridian Grocers plc', 'Meridian Grocers')).toBeGreaterThan(0.8);
  });
});
