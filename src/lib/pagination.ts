import { z } from 'zod';

export const pageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(value: { createdAt: Date | string; id: string }): string {
  const createdAt = value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt;
  return Buffer.from(JSON.stringify({ createdAt, id: value.id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed.createdAt || !parsed.id) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}
