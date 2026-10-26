import { z } from 'zod';
import {
  CONFIDENCE_LEVELS,
  IDENTIFIER_SCHEMES,
  LANGUAGES,
  MARKETS,
  PERSON_ROLES,
  PRACTICES,
  RELATIONSHIP_TYPE_LIST,
  SIGNAL_TYPE_LIST,
  SOURCE_KINDS,
} from '../../domain/taxonomy';

export const CONTRACT_VERSION = '1.0.0';

export const identifierSchema = z.object({
  scheme: z.enum(IDENTIFIER_SCHEMES),
  value: z.string().min(1),
});

export const mentionSchema = z.object({
  ref: z.string(),
  kind: z.enum(['company', 'person', 'authority']),
  name: z.string(),
  role: z.string().optional(),
  identifiers: z.array(identifierSchema).optional(),
  market: z.enum(MARKETS).optional(),
  companyRef: z.string().optional(),
  title: z.string().optional(),
  personRole: z.enum(PERSON_ROLES).optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  sectorCode: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const recordInputSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  kind: z.enum(SOURCE_KINDS),
  market: z.enum([...MARKETS, 'GLOBAL'] as const),
  language: z.enum(LANGUAGES),
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  publishedAt: z.string(),
  extracted: z.object({
    mentions: z.array(mentionSchema),
    attributes: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const detectInputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('detect'),
  record: recordInputSchema,
});

export const detectOutputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('detect'),
  signals: z.array(
    z.object({
      type: z.enum(SIGNAL_TYPE_LIST),
      subjectRef: z.string(),
      relatedRef: z.string().optional(),
      mentions: z.array(mentionSchema),
      confidence: z.number().min(0).max(1),
      payload: z.record(z.string(), z.unknown()).default({}),
      rationale: z.string(),
    }),
  ),
});

export const companySnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  market: z.enum(MARKETS).nullable(),
  sector: z.string().nullable(),
  employeeCount: z.number().nullable(),
  identifiers: z.array(identifierSchema),
});

export const signalSnapshotSchema = z.object({
  id: z.string(),
  type: z.enum(SIGNAL_TYPE_LIST),
  publishedAt: z.string(),
  recordId: z.string(),
  sourceId: z.string(),
  subjectCompanyId: z.string().nullable(),
  relatedCompanyId: z.string().nullable(),
  relatedCompanyName: z.string().nullable().optional(),
  confidence: z.number(),
  payload: z.record(z.string(), z.unknown()),
});

export const relationshipSnapshotSchema = z.object({
  type: z.enum(RELATIONSHIP_TYPE_LIST),
  fromCompanyId: z.string(),
  toCompanyId: z.string(),
  fromName: z.string(),
  toName: z.string(),
  amount: z.number().nullable().optional(),
});

export const predictInputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('predict'),
  asOf: z.string(),
  company: companySnapshotSchema,
  signals: z.array(signalSnapshotSchema),
  relationships: z.array(relationshipSnapshotSchema),
  exposures: z.array(
    z.object({
      role: z.string(),
      practice: z.enum(PRACTICES),
      eventCompanyName: z.string(),
      eventType: z.enum(SIGNAL_TYPE_LIST),
    }),
  ),
});

export const predictOutputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('predict'),
  scores: z.array(
    z.object({
      practice: z.enum(PRACTICES),
      likelihood: z.number().min(0).max(1),
      confidence: z.enum(CONFIDENCE_LEVELS),
      windowMinDays: z.number().int(),
      windowMaxDays: z.number().int(),
      rationale: z.string(),
      evidence: z.array(
        z.object({
          recordId: z.string().optional(),
          signalId: z.string().optional(),
          weight: z.number().optional(),
          note: z.string(),
        }),
      ),
      contributions: z.array(
        z.object({
          feature: z.string(),
          value: z.number(),
          weight: z.number(),
          contribution: z.number(),
        }),
      ),
    }),
  ),
});

export const draftInputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('draft'),
  kind: z.enum(['warm', 'cold']),
  language: z.enum(LANGUAGES),
  partner: z.object({
    name: z.string(),
    title: z.string(),
    practices: z.array(z.enum(PRACTICES)),
    voiceSample: z.string().nullable(),
    voiceNotes: z.string().nullable(),
  }),
  recipient: z.object({
    name: z.string(),
    role: z.string().nullable(),
    companyName: z.string(),
  }),
  opportunity: z.object({
    practice: z.enum(PRACTICES),
    rationale: z.string(),
    windowMinDays: z.number(),
    windowMaxDays: z.number(),
  }),
  records: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().nullable(),
      publishedAt: z.string(),
      summary: z.string().nullable(),
    }),
  ),
  priorCorrespondence: z.number().int().nonnegative(),
});

export const draftOutputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('draft'),
  subject: z.string(),
  body: z.string(),
  citations: z.array(
    z.object({
      recordId: z.string(),
      url: z.string().nullable().optional(),
      title: z.string().optional(),
    }),
  ),
});

export const feedbackInputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('feedback'),
  firmId: z.string(),
  opportunityId: z.string(),
  kind: z.string(),
  practice: z.enum(PRACTICES),
  features: z.record(z.string(), z.number()),
});

export const feedbackOutputSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  task: z.literal('feedback'),
  accepted: z.boolean(),
});

export type DetectInput = z.infer<typeof detectInputSchema>;
export type DetectOutput = z.infer<typeof detectOutputSchema>;
export type PredictInput = z.infer<typeof predictInputSchema>;
export type PredictOutput = z.infer<typeof predictOutputSchema>;
export type DraftInput = z.infer<typeof draftInputSchema>;
export type DraftOutput = z.infer<typeof draftOutputSchema>;
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type FeedbackOutput = z.infer<typeof feedbackOutputSchema>;

export type SwarmTask = 'detect' | 'predict' | 'draft' | 'feedback';

export interface SwarmProvider {
  readonly name: string;
  detect(input: DetectInput): Promise<DetectOutput>;
  predict(input: PredictInput): Promise<PredictOutput>;
  draft(input: DraftInput): Promise<DraftOutput>;
  feedback?(input: FeedbackInput): Promise<FeedbackOutput>;
}
