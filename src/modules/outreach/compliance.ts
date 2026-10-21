import { and, eq, gte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { approaches, clientRelationships, contacts, messages, outreachRules } from '../../db/schema';
import type { ComplianceResult } from '../../domain/types';
import { addDays } from '../../lib/time';

export async function checkCompliance(
  db: Database,
  input: {
    firmId: string;
    companyId: string;
    contactId?: string | null;
    market?: string | null;
    kind: 'warm' | 'cold';
    subject: string;
    body: string;
    hasCitation: boolean;
  },
): Promise<ComplianceResult[]> {
  const rules = await db.select().from(outreachRules).where(eq(outreachRules.firmId, input.firmId));
  const results: ComplianceResult[] = [];

  const rels = await db
    .select()
    .from(clientRelationships)
    .where(and(eq(clientRelationships.firmId, input.firmId), eq(clientRelationships.companyId, input.companyId)));
  const blocked = rels.find((r) => r.status === 'conflict' || r.status === 'do_not_contact');
  results.push({
    ruleId: rules.find((r) => r.kind === 'do_not_contact_conflicts')?.id ?? null,
    kind: 'do_not_contact_conflicts',
    passed: !blocked,
    message: blocked ? `Company is marked ${blocked.status}` : 'Not a conflict or do-not-contact',
  });

  if (input.contactId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId));
    if (contact?.doNotContact) {
      results.push({
        ruleId: null,
        kind: 'do_not_contact_contact',
        passed: false,
        message: 'This person is marked do-not-contact',
      });
    }
  }

  const cap = rules.find((r) => r.kind === 'frequency_cap');
  const maxDays = Number(cap?.config.maxPerCompanyDays ?? 30);
  const since = addDays(new Date(), -maxDays);
  const recent = await db
    .select()
    .from(approaches)
    .where(and(eq(approaches.firmId, input.firmId), gte(approaches.sentAt, since)));
  const sentRecently = recent.filter((a) => a.sentAt && a.status === 'sent').length;
  results.push({
    ruleId: cap?.id ?? null,
    kind: 'frequency_cap',
    passed: sentRecently < 8,
    message: sentRecently < 8 ? 'Inside frequency cap' : 'Too many recent messages from this firm',
  });

  const requireSource = rules.find((r) => r.kind === 'required_source');
  results.push({
    ruleId: requireSource?.id ?? null,
    kind: 'required_source',
    passed: input.hasCitation && /source:/i.test(input.body),
    message: input.hasCitation ? 'Source attached' : 'Draft is missing the source of the record',
  });

  const market = input.market ?? 'GLOBAL';
  const bar = rules.find((r) => r.kind === 'bar_solicitation' && (r.market === market || r.market === 'GLOBAL'));
  if (bar?.config.noColdSolicitation && input.kind === 'cold') {
    results.push({
      ruleId: bar.id,
      kind: 'bar_solicitation',
      passed: false,
      message: 'Cold solicitation is not allowed in this jurisdiction',
    });
  } else if (bar?.config.identifyAsAdvertising && input.kind === 'cold' && !/advertis/i.test(input.body)) {
    results.push({
      ruleId: bar.id,
      kind: 'bar_solicitation',
      passed: false,
      message: 'Cold notes in this market must identify themselves as advertising',
    });
  } else if (bar) {
    results.push({
      ruleId: bar.id,
      kind: 'bar_solicitation',
      passed: true,
      message: 'Bar rules satisfied',
    });
  }

  void messages;
  return results;
}

export function isCompliant(results: ComplianceResult[]): boolean {
  return results.every((r) => r.passed);
}
