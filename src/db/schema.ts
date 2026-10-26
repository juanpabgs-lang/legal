import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  ApproachStatus,
  Confidence,
  FeedbackKind,
  IdentifierScheme,
  Language,
  Market,
  OpportunityStatus,
  PersonRole,
  Practice,
  RelationshipFlag,
  RelationshipType,
  SignalType,
  SourceKind,
  SourceMarket,
  UserRole,
} from '../domain/taxonomy';
import type {
  Citation,
  ComplianceResult,
  Contribution,
  EvidenceItem,
  FocusSettings,
  Identifier,
  Mention,
  ModelWeights,
  PlaybookConfig,
  RouteCandidate,
  RoutePathStep,
} from '../domain/types';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const firms = pgTable('firms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  markets: jsonb('markets').$type<Market[]>().notNull().default([]),
  jurisdictions: jsonb('jurisdictions').$type<string[]>().notNull().default([]),
  ...timestamps,
}, (t) => [uniqueIndex('firms_slug_idx').on(t.slug)]);

export const offices = pgTable('offices', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  city: text('city'),
  market: text('market').$type<Market>(),
  ...timestamps,
});

export const practiceGroups = pgTable(
  'practice_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    practice: text('practice').$type<Practice>().notNull(),
    name: text('name').notNull(),
    leadPartnerId: uuid('lead_partner_id'),
    ...timestamps,
  },
  (t) => [uniqueIndex('practice_groups_firm_practice_idx').on(t.firmId, t.practice)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role').$type<UserRole>().notNull().default('viewer'),
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_firm_email_idx').on(t.firmId, t.email), index('users_firm_idx').on(t.firmId)],
);

export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    officeId: uuid('office_id').references(() => offices.id, { onDelete: 'set null' }),
    practiceGroupId: uuid('practice_group_id').references(() => practiceGroups.id, { onDelete: 'set null' }),
    practices: jsonb('practices').$type<Practice[]>().notNull().default([]),
    title: text('title').notNull().default('Partner'),
    voiceSample: text('voice_sample'),
    voiceNotes: text('voice_notes'),
    mailboxEmail: text('mailbox_email'),
    ...timestamps,
  },
  (t) => [uniqueIndex('partners_user_idx').on(t.userId), index('partners_firm_idx').on(t.firmId)],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('api_keys_prefix_idx').on(t.prefix), index('api_keys_firm_idx').on(t.firmId)],
);

export const playbooks = pgTable(
  'playbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    practice: text('practice').$type<Practice>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').$type<PlaybookConfig>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('playbooks_firm_practice_idx').on(t.firmId, t.practice)],
);

export const firmSettings = pgTable('firm_settings', {
  firmId: uuid('firm_id').primaryKey().references(() => firms.id, { onDelete: 'cascade' }),
  volume: text('volume').$type<'focused' | 'balanced' | 'all'>().notNull().default('focused'),
  reach: text('reach').$type<'warm' | 'warm_and_cold'>().notNull().default('warm'),
  autonomy: text('autonomy').$type<'approve' | 'playbook'>().notNull().default('approve'),
  focus: jsonb('focus').$type<FocusSettings>().notNull().default({}),
  weeklyShortlistSize: integer('weekly_shortlist_size').notNull().default(15),
  ...timestamps,
});

export const outreachRules = pgTable(
  'outreach_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    market: text('market').$type<Market | 'GLOBAL'>().notNull().default('GLOBAL'),
    kind: text('kind').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index('outreach_rules_firm_idx').on(t.firmId, t.market)],
);

export const sources = pgTable(
  'sources',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    market: text('market').$type<SourceMarket>().notNull(),
    kind: text('kind').$type<SourceKind>().notNull(),
    connector: text('connector').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    requiresKey: boolean('requires_key').notNull().default(false),
    cron: text('cron').notNull().default('0 */6 * * *'),
    rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(20),
    homeUrl: text('home_url'),
    ...timestamps,
  },
);

export const sourceCursors = pgTable('source_cursors', {
  sourceId: text('source_id').primaryKey().references(() => sources.id, { onDelete: 'cascade' }),
  cursor: jsonb('cursor').$type<Record<string, unknown>>().notNull().default({}),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastError: text('last_error'),
  lastFetchedCount: integer('last_fetched_count').notNull().default(0),
  ...timestamps,
});

export const records = pgTable(
  'records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: text('source_id').notNull().references(() => sources.id),
    externalId: text('external_id').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    title: text('title').notNull(),
    summary: text('summary'),
    body: text('body'),
    url: text('url'),
    language: text('language').$type<Language>().notNull().default('en'),
    market: text('market').$type<SourceMarket>().notNull(),
    kind: text('kind').$type<SourceKind>().notNull(),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    extracted: jsonb('extracted').$type<{ mentions: Mention[]; attributes?: Record<string, unknown> }>().notNull().default({
      mentions: [],
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('records_source_external_idx').on(t.sourceId, t.externalId),
    index('records_published_idx').on(t.publishedAt),
    index('records_market_idx').on(t.market, t.kind),
  ],
);

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    market: text('market').$type<Market>(),
    sector: text('sector'),
    employeeCount: integer('employee_count'),
    description: text('description'),
    identifiers: jsonb('identifiers').$type<Identifier[]>().notNull().default([]),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index('companies_normalized_idx').on(t.normalizedName), index('companies_market_idx').on(t.market)],
);

export const companyIdentifiers = pgTable(
  'company_identifiers',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    scheme: text('scheme').$type<IdentifierScheme>().notNull(),
    value: text('value').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scheme, t.value] }),
    index('company_identifiers_company_idx').on(t.companyId),
  ],
);

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    title: text('title'),
    market: text('market').$type<Market>(),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index('people_normalized_idx').on(t.normalizedName)],
);

export const companyPeople = pgTable(
  'company_people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
    role: text('role').$type<PersonRole>().notNull().default('officer'),
    title: text('title'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    sourceRecordId: uuid('source_record_id').references(() => records.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('company_people_unique_idx').on(t.companyId, t.personId, t.role)],
);

export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromCompanyId: uuid('from_company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    toCompanyId: uuid('to_company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    type: text('type').$type<RelationshipType>().notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }),
    currency: text('currency'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    evidenceRecordId: uuid('evidence_record_id').references(() => records.id, { onDelete: 'set null' }),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('relationships_edge_idx').on(t.fromCompanyId, t.toCompanyId, t.type),
    index('relationships_to_idx').on(t.toCompanyId, t.type),
  ],
);

export const signals = pgTable(
  'signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordId: uuid('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
    type: text('type').$type<SignalType>().notNull(),
    subjectCompanyId: uuid('subject_company_id').references(() => companies.id, { onDelete: 'set null' }),
    relatedCompanyId: uuid('related_company_id').references(() => companies.id, { onDelete: 'set null' }),
    mentions: jsonb('mentions').$type<Mention[]>().notNull().default([]),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    confidence: real('confidence').notNull().default(0.7),
    ...timestamps,
  },
  (t) => [
    index('signals_subject_idx').on(t.subjectCompanyId, t.type),
    index('signals_record_idx').on(t.recordId),
    uniqueIndex('signals_record_type_subject_idx').on(t.recordId, t.type, t.subjectCompanyId),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email'),
    role: text('role').$type<PersonRole>(),
    title: text('title'),
    doNotContact: boolean('do_not_contact').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('contacts_firm_company_idx').on(t.firmId, t.companyId),
    index('contacts_firm_email_idx').on(t.firmId, t.email),
  ],
);

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('email'),
    direction: text('direction').$type<'in' | 'out' | 'both'>().notNull().default('out'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('interactions_partner_contact_idx').on(t.partnerId, t.contactId, t.occurredAt)],
);

export const clientRelationships = pgTable(
  'client_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    status: text('status').$type<'client' | 'conflict' | 'panel' | 'do_not_contact'>().notNull(),
    practices: jsonb('practices').$type<Practice[]>().notNull().default([]),
    lastMatterAt: timestamp('last_matter_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [uniqueIndex('client_rel_firm_company_status_idx').on(t.firmId, t.companyId, t.status)],
);

export const firmPredictions = pgTable(
  'firm_predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    practice: text('practice').$type<Practice>().notNull(),
    likelihood: real('likelihood').notNull(),
    confidence: text('confidence').$type<Confidence>().notNull(),
    windowMinDays: integer('window_min_days').notNull(),
    windowMaxDays: integer('window_max_days').notNull(),
    rationale: text('rationale').notNull(),
    evidence: jsonb('evidence').$type<EvidenceItem[]>().notNull().default([]),
    contributions: jsonb('contributions').$type<Contribution[]>().notNull().default([]),
    modelVersion: integer('model_version').notNull().default(1),
    predictedAt: timestamp('predicted_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('firm_predictions_unique_idx').on(t.firmId, t.companyId, t.practice),
    index('firm_predictions_rank_idx').on(t.firmId, t.practice, t.likelihood),
  ],
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    practice: text('practice').$type<Practice>().notNull(),
    predictionId: uuid('prediction_id').references(() => firmPredictions.id, { onDelete: 'set null' }),
    eventRecordId: uuid('event_record_id').references(() => records.id, { onDelete: 'set null' }),
    cascadeFromOpportunityId: uuid('cascade_from_opportunity_id'),
    exposureRole: text('exposure_role'),
    status: text('status').$type<OpportunityStatus>().notNull().default('new'),
    relationshipFlag: text('relationship_flag').$type<RelationshipFlag>().notNull().default('new'),
    assignedPartnerId: uuid('assigned_partner_id').references(() => partners.id, { onDelete: 'set null' }),
    likelihood: real('likelihood').notNull().default(0),
    confidence: text('confidence').$type<Confidence>().notNull().default('medium'),
    windowMinDays: integer('window_min_days').notNull().default(7),
    windowMaxDays: integer('window_max_days').notNull().default(28),
    rationale: text('rationale'),
    shortlistedAt: timestamp('shortlisted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('opportunities_unique_idx').on(t.firmId, t.companyId, t.practice, t.eventRecordId),
    index('opportunities_firm_status_idx').on(t.firmId, t.status, t.likelihood),
    index('opportunities_partner_idx').on(t.assignedPartnerId, t.status),
  ],
);

export const opportunitySignals = pgTable(
  'opportunity_signals',
  {
    opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    signalId: uuid('signal_id').notNull().references(() => signals.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.opportunityId, t.signalId] })],
);

export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    kind: text('kind').$type<'warm' | 'cold'>().notNull(),
    tieStrength: real('tie_strength').notNull().default(0),
    interactions12m: integer('interactions_12m').notNull().default(0),
    path: jsonb('path').$type<RoutePathStep[]>().notNull().default([]),
    candidates: jsonb('candidates').$type<RouteCandidate[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex('routes_opportunity_idx').on(t.opportunityId)],
);

export const approaches = pgTable(
  'approaches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'set null' }),
    routeId: uuid('route_id').references(() => routes.id, { onDelete: 'set null' }),
    kind: text('kind').$type<'warm' | 'cold'>().notNull(),
    status: text('status').$type<ApproachStatus>().notNull().default('pending_draft'),
    toEmail: text('to_email'),
    toName: text('to_name'),
    blockedReason: text('blocked_reason'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('approaches_firm_status_idx').on(t.firmId, t.status)],
);

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approachId: uuid('approach_id').notNull().references(() => approaches.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    source: text('source').$type<'swarm' | 'partner'>().notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    citations: jsonb('citations').$type<Citation[]>().notNull().default([]),
    compliance: jsonb('compliance').$type<ComplianceResult[]>().notNull().default([]),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('drafts_approach_version_idx').on(t.approachId, t.version)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approachId: uuid('approach_id').notNull().references(() => approaches.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id').references(() => drafts.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index('messages_approach_idx').on(t.approachId)],
);

export const replies = pgTable('replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  approachId: uuid('approach_id').notNull().references(() => approaches.id, { onDelete: 'cascade' }),
  fromAddress: text('from_address').notNull(),
  body: text('body'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source').$type<'mailbox' | 'manual'>().notNull().default('manual'),
  ...timestamps,
});

export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outbox_firm_idx').on(t.firmId, t.sentAt)],
);

export const mailboxes = pgTable(
  'mailboxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<'smtp' | 'gmail' | 'microsoft'>().notNull(),
    email: text('email').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    metadataOnly: boolean('metadata_only').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('mailboxes_partner_idx').on(t.partnerId)],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').$type<FeedbackKind>().notNull(),
    reason: text('reason'),
    ...timestamps,
  },
  (t) => [index('feedback_firm_idx').on(t.firmId, t.kind)],
);

export const modelVersions = pgTable(
  'model_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    weights: jsonb('weights').$type<ModelWeights>().notNull(),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('model_versions_firm_version_idx').on(t.firmId, t.version)],
);

export const pilots = pgTable('pilots', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').$type<'setup' | 'running' | 'scored' | 'ended'>().notNull().default('setup'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  practices: jsonb('practices').$type<Practice[]>().notNull().default([]),
  notes: text('notes'),
  ...timestamps,
});

export const pilotWeeks = pgTable(
  'pilot_weeks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pilotId: uuid('pilot_id').notNull().references(() => pilots.id, { onDelete: 'cascade' }),
    week: integer('week').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    shortlistSize: integer('shortlist_size').notNull().default(0),
    accepted: integer('accepted').notNull().default(0),
    dismissed: integer('dismissed').notNull().default(0),
    sent: integer('sent').notNull().default(0),
    replies: integer('replies').notNull().default(0),
    report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex('pilot_weeks_unique_idx').on(t.pilotId, t.week)],
);

export const scorecards = pgTable(
  'scorecards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    pilotId: uuid('pilot_id').references(() => pilots.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (t) => [index('scorecards_firm_idx').on(t.firmId)],
);

export const swarmCalls = pgTable(
  'swarm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    status: text('status').$type<'ok' | 'error' | 'fallback' | 'pending'>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    remoteId: text('remote_id'),
    input: jsonb('input').$type<unknown>().notNull(),
    output: jsonb('output').$type<unknown>(),
    error: text('error'),
    latencyMs: integer('latency_ms'),
    costUsd: real('cost_usd'),
    firmId: uuid('firm_id'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('swarm_calls_idempotency_idx').on(t.idempotencyKey),
    index('swarm_calls_task_idx').on(t.task, t.createdAt),
  ],
);

export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_events_firm_idx').on(t.firmId, t.createdAt)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id'),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_firm_idx').on(t.firmId, t.createdAt)],
);

export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    remoteId: text('remote_id'),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('webhook_inbox_remote_idx').on(t.provider, t.remoteId)],
);

export type Firm = typeof firms.$inferSelect;
export type User = typeof users.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Person = typeof people.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type Approach = typeof approaches.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type FirmSettings = typeof firmSettings.$inferSelect;
export type Playbook = typeof playbooks.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ClientRelationship = typeof clientRelationships.$inferSelect;
export type FirmPrediction = typeof firmPredictions.$inferSelect;
export type Route = typeof routes.$inferSelect;
export type Pilot = typeof pilots.$inferSelect;
export type ModelVersion = typeof modelVersions.$inferSelect;
export type Source = typeof sources.$inferSelect;
