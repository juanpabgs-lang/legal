import { getDb } from '../db/client';
import { logger } from '../lib/logger';
import { applyFeedback } from '../modules/learning/service';
import { approveAndSend, draftApproach } from '../modules/outreach/service';
import { syncMailboxMetadata } from '../modules/outreach/mail';
import { processRecord } from '../modules/pipeline/process-record';
import { buildScorecard, rollWeek } from '../modules/pilot/service';
import { ingestSource } from '../modules/sources/ingest';
import { QUEUES, type DraftApproachJob, type IngestSourceJob, type LearnJob, type ProcessRecordJob, type ScorecardJob, type SendApproachJob, type SyncMailboxJob, type WeeklyDigestJob } from './queues';
import type { PgBoss } from 'pg-boss';

export async function registerWorkers(boss: PgBoss): Promise<void> {
  const db = getDb();

  await boss.work<IngestSourceJob>(QUEUES.ingestSource, { localConcurrency: 2 }, async ([job]) => {
    logger.info({ sourceId: job.data.sourceId }, 'ingest source');
    await ingestSource(db, job.data.sourceId, job.data.lookbackDays);
  });

  await boss.work<ProcessRecordJob>(QUEUES.processRecord, { localConcurrency: 4 }, async ([job]) => {
    await processRecord(db, job.data.recordId);
  });

  await boss.work<DraftApproachJob>(QUEUES.draftApproach, async ([job]) => {
    await draftApproach(db, job.data.approachId);
  });

  await boss.work<SendApproachJob>(QUEUES.sendApproach, async ([job]) => {
    const approachId = job.data.approachId;
    await approveAndSend(db, { firmId: 'unknown', approachId, userId: null });
  });

  await boss.work<SyncMailboxJob>(QUEUES.syncMailbox, async ([job]) => {
    await syncMailboxMetadata(db, job.data.mailboxId);
  });

  await boss.work<WeeklyDigestJob>(QUEUES.weeklyDigest, async ([job]) => {
    if (job.data.pilotId) await rollWeek(db, job.data.firmId, job.data.pilotId, 1);
  });

  await boss.work<ScorecardJob>(QUEUES.scorecard, async ([job]) => {
    await buildScorecard(db, job.data.firmId, job.data.pilotId);
  });

  await boss.work<LearnJob>(QUEUES.learn, async ([job]) => {
    await applyFeedback(db, { firmId: job.data.firmId, opportunityId: job.data.opportunityId, kind: 'accept' });
  });
}

export async function registerSchedules(boss: PgBoss): Promise<void> {
  const { sources } = await import('../db/schema');
  const { eq } = await import('drizzle-orm');
  const db = getDb();
  const rows = await db.select().from(sources).where(eq(sources.enabled, true));
  for (const source of rows) {
    await boss.schedule(QUEUES.ingestSource, source.cron, { sourceId: source.id }, { key: source.id });
  }
}
