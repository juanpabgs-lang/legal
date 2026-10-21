const LEGAL_SUFFIXES = new Set([
  'ltd',
  'limited',
  'llc',
  'llp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'plc',
  'co',
  'company',
  'sa',
  'sas',
  'sarl',
  'gmbh',
  'sl',
  'slu',
  'sae',
  'nv',
  'bv',
  'ag',
  'spa',
  'srl',
  'oy',
  'ab',
  'the',
  'group',
  'holdings',
  'holding',
]);

export function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '');
}

export function normalizeName(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0 && !LEGAL_SUFFIXES.has(part))
    .join(' ');
}

export function compactName(value: string): string {
  return normalizeName(value).replace(/\s+/g, '');
}

export function tokenSet(value: string): Set<string> {
  return new Set(normalizeName(value).split(' ').filter(Boolean));
}

/** Dice coefficient on character bigrams — good enough for registry-name matching. */
export function dice(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const grams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i += 1) {
      const g = padded.slice(i, i + 2);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };
  const A = grams(left);
  const B = grams(right);
  let overlap = 0;
  let total = 0;
  for (const count of A.values()) total += count;
  for (const count of B.values()) total += count;
  for (const [g, count] of A) overlap += Math.min(count, B.get(g) ?? 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

export function namesMatch(a: string, b: string, threshold = 0.86): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (compactName(a) === compactName(b)) return true;
  return dice(a, b) >= threshold;
}
