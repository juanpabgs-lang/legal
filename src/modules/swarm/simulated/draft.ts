import { CONTRACT_VERSION, type DraftInput, type DraftOutput } from '../contracts';

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function voiceCue(sample: string | null): { warmOpen: boolean; short: boolean } {
  if (!sample) return { warmOpen: true, short: true };
  const sentences = sample.split(/[.!?]/).filter((s) => s.trim().length > 0);
  const avg = sentences.reduce((n, s) => n + s.length, 0) / Math.max(1, sentences.length);
  return { warmOpen: /dear|hope you|good to/i.test(sample), short: avg < 140 };
}

export function draftSimulated(input: DraftInput): DraftOutput {
  const cue = voiceCue(input.partner.voiceSample);
  const recipientFirst = firstName(input.recipient.name);
  const record = input.records[0];
  const problem = input.opportunity.rationale.split(';')[0]?.trim() ?? input.opportunity.practice;
  const sourceLine = record ? `${record.title}${record.url ? ` — ${record.url}` : ''}` : 'the public record';

  let subject: string;
  let body: string;

  if (input.kind === 'warm') {
    subject = `${input.recipient.companyName} — ${problem}`;
    const opener = cue.warmOpen
      ? `${recipientFirst}, good to pick this up with you rather than a cold note.`
      : `${recipientFirst} —`;
    const history =
      input.priorCorrespondence > 0
        ? `We have corresponded ${input.priorCorrespondence} times in the last year, so I wanted you to see this first.`
        : `I wanted you to see this before it becomes a general approach.`;
    const ask = cue.short
      ? `Worth 20 minutes this week?`
      : `If it would help, I can walk through what the record implies for ${input.recipient.companyName} in the next ${input.opportunity.windowMinDays} to ${input.opportunity.windowMaxDays} days.`;
    body = [
      opener,
      '',
      history,
      '',
      `The record shows: ${problem}.`,
      `Source: ${sourceLine}.`,
      '',
      ask,
      '',
      input.partner.name,
    ].join('\n');
  } else {
    subject = `${input.recipient.companyName}: ${problem}. Worth 20 minutes?`;
    body = [
      `Dear ${input.recipient.name},`,
      '',
      `A public record names a problem that usually needs advice in ${input.opportunity.practice.replace('_', ' ')} in the next ${input.opportunity.windowMinDays} to ${input.opportunity.windowMaxDays} days.`,
      '',
      problem + '.',
      `Source: ${sourceLine}.`,
      '',
      'If the record is already in hand, please ignore this. If not, I can take 20 minutes on what it means.',
      '',
      input.partner.name,
    ].join('\n');
  }

  return {
    version: CONTRACT_VERSION,
    task: 'draft',
    subject,
    body,
    citations: input.records.map((r) => ({ recordId: r.id, url: r.url, title: r.title })),
  };
}
