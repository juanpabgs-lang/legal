import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { feedback, firmPredictions, modelVersions, opportunities } from '../../db/schema';
import type { FeedbackKind } from '../../domain/taxonomy';
import type { ModelWeights } from '../../domain/types';

const DELTAS: Record<FeedbackKind, number> = {
  accept: 0.08,
  dismiss: -0.1,
  reply: 0.12,
  meeting: 0.16,
  pitched: 0.14,
  matter_opened: 0.22,
  won: 0.28,
  lost: -0.12,
};

export async function applyFeedback(
  db: Database,
  input: { firmId: string; userId?: string | null; opportunityId: string; kind: FeedbackKind; reason?: string },
) {
  await db.insert(feedback).values({
    firmId: input.firmId,
    userId: input.userId ?? null,
    opportunityId: input.opportunityId,
    kind: input.kind,
    reason: input.reason,
  });

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId));
  const [prediction] = opp?.predictionId
    ? await db.select().from(firmPredictions).where(eq(firmPredictions.id, opp.predictionId))
    : [undefined];
  const [current] = await db
    .select()
    .from(modelVersions)
    .where(and(eq(modelVersions.firmId, input.firmId), eq(modelVersions.active, true)))
    .orderBy(desc(modelVersions.version))
    .limit(1);

  const weights: ModelWeights = { ...(current?.weights ?? {}) };
  const delta = DELTAS[input.kind];
  const features = prediction?.contributions.map((c) => c.feature) ?? [`practice:${opp?.practice ?? 'unknown'}`];
  for (const feature of features) {
    weights[feature] = Number(((weights[feature] ?? 0) + delta).toFixed(4));
  }

  if (current) {
    await db.update(modelVersions).set({ active: false, updatedAt: new Date() }).where(eq(modelVersions.id, current.id));
  }
  const [next] = await db
    .insert(modelVersions)
    .values({
      firmId: input.firmId,
      version: (current?.version ?? 0) + 1,
      weights,
      notes: `${input.kind} on ${input.opportunityId}`,
      active: true,
    })
    .returning();
  return next;
}

export async function rollbackModel(db: Database, firmId: string, version: number) {
  await db.update(modelVersions).set({ active: false, updatedAt: new Date() }).where(eq(modelVersions.firmId, firmId));
  const [row] = await db
    .update(modelVersions)
    .set({ active: true, updatedAt: new Date() })
    .where(and(eq(modelVersions.firmId, firmId), eq(modelVersions.version, version)))
    .returning();
  return row;
}
