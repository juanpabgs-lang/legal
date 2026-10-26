export const QUEUES = {
  ingestSource: 'source.ingest',
  processRecord: 'record.process',
  draftApproach: 'approach.draft',
  sendApproach: 'approach.send',
  syncMailbox: 'mailbox.sync',
  weeklyDigest: 'pilot.weekly',
  scorecard: 'pilot.scorecard',
  learn: 'learner.update',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface IngestSourceJob {
  sourceId: string;
  lookbackDays?: number;
}

export interface ProcessRecordJob {
  recordId: string;
}

export interface DraftApproachJob {
  approachId: string;
}

export interface SendApproachJob {
  approachId: string;
}

export interface SyncMailboxJob {
  mailboxId: string;
}

export interface WeeklyDigestJob {
  firmId: string;
  pilotId?: string;
}

export interface ScorecardJob {
  firmId: string;
  pilotId?: string;
}

export interface LearnJob {
  firmId: string;
  opportunityId: string;
}
