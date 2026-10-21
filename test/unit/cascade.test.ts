import { describe, expect, it } from 'vitest';
import { cascadeFromEvent } from '../../src/modules/intelligence/cascade';

describe('cascadeFromEvent', () => {
  it('fans a supermarket insolvency out to creditors, landlords, lender, bidder and operator', () => {
    const supermarket = 'super';
    const hits = cascadeFromEvent('insolvency.proceedings_opened', supermarket, [
      { id: '1', fromCompanyId: 'cred-1', toCompanyId: supermarket, type: 'creditor_of', amount: null, attributes: {} },
      { id: '2', fromCompanyId: 'landlord-1', toCompanyId: supermarket, type: 'landlord_of', amount: null, attributes: {} },
      { id: '3', fromCompanyId: 'lender-1', toCompanyId: supermarket, type: 'lends_to', amount: null, attributes: {} },
      { id: '4', fromCompanyId: 'bidder-1', toCompanyId: supermarket, type: 'bidder_for', amount: null, attributes: {} },
      { id: '5', fromCompanyId: 'ops-1', toCompanyId: supermarket, type: 'operates_for', amount: null, attributes: {} },
    ]);
    expect(hits.filter((h) => h.role === 'creditor').map((h) => h.practice)).toEqual(['insolvency']);
    expect(hits.filter((h) => h.role === 'landlord').map((h) => h.practice)).toEqual(['real_estate']);
    expect(hits.filter((h) => h.role === 'lender').map((h) => h.practice)).toEqual(['banking']);
    expect(hits.filter((h) => h.role === 'bidder').map((h) => h.practice)).toEqual(['mna']);
    expect(hits.filter((h) => h.role === 'operator').map((h) => h.practice)).toEqual(['employment']);
  });
});
