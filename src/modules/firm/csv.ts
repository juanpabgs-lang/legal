import { parse } from 'csv-parse/sync';

export function parseCsv<T extends Record<string, string>>(text: string): T[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

export function parseJsonArray<T>(text: string): T[] {
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value)) throw new Error('Expected a JSON array');
  return value as T[];
}
