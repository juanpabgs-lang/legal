import type { Language, SourceKind, SourceMarket } from '../../domain/taxonomy';
import type { Mention } from '../../domain/types';

export interface NormalizedRecord {
  externalId: string;
  publishedAt: Date;
  title: string;
  summary?: string | null;
  body?: string | null;
  url?: string | null;
  language?: Language;
  market: SourceMarket;
  kind: SourceKind;
  raw: Record<string, unknown>;
  extracted?: { mentions: Mention[]; attributes?: Record<string, unknown> };
}

export interface IngestContext {
  lookbackDays: number;
  cursor: Record<string, unknown>;
  userAgent: string;
}

export interface Connector {
  id: string;
  fetch(ctx: IngestContext): Promise<{ records: NormalizedRecord[]; cursor: Record<string, unknown> }>;
}
