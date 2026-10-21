import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { activityEvents, auditLog } from '../../db/schema';
import { EventEmitter } from 'node:events';

export const activityBus = new EventEmitter();
activityBus.setMaxListeners(100);

export async function emitActivity(
  db: Database,
  input: { firmId?: string | null; kind: string; title: string; detail?: Record<string, unknown> },
): Promise<void> {
  const [row] = await db
    .insert(activityEvents)
    .values({
      firmId: input.firmId ?? null,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? {},
    })
    .returning();
  activityBus.emit('event', row);
}

export async function writeAudit(
  db: Database,
  input: {
    firmId?: string | null;
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    firmId: input.firmId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    payload: input.payload ?? {},
  });
}

export async function listActivity(db: Database, firmId: string | null, limit = 50) {
  if (firmId) {
    return db.select().from(activityEvents).where(eq(activityEvents.firmId, firmId)).orderBy(desc(activityEvents.createdAt)).limit(limit);
  }
  return db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(limit);
}
