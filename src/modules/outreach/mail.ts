import nodemailer from 'nodemailer';
import { getConfig } from '../../config';
import type { Database } from '../../db/client';
import { outboxMessages } from '../../db/schema';

export interface OutgoingMail {
  firmId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId?: string;
}

export interface MailResult {
  provider: string;
  providerMessageId: string;
}

export async function sendMail(db: Database, mail: OutgoingMail): Promise<MailResult> {
  const cfg = getConfig();
  if (cfg.MAIL_PROVIDER === 'test' || !cfg.SMTP_URL) {
    const [row] = await db
      .insert(outboxMessages)
      .values({
        firmId: mail.firmId,
        messageId: mail.messageId,
        fromAddress: mail.from,
        toAddress: mail.to,
        subject: mail.subject,
        body: mail.body,
        headers: { 'x-norfront-provider': 'test' },
      })
      .returning();
    return { provider: 'test', providerMessageId: row.id };
  }

  if (cfg.MAIL_PROVIDER === 'smtp' && cfg.SMTP_URL) {
    const transport = nodemailer.createTransport(cfg.SMTP_URL);
    const info = await transport.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.body,
    });
    await db.insert(outboxMessages).values({
      firmId: mail.firmId,
      messageId: mail.messageId,
      fromAddress: mail.from,
      toAddress: mail.to,
      subject: mail.subject,
      body: mail.body,
      headers: { 'x-norfront-provider': 'smtp' },
    });
    return { provider: 'smtp', providerMessageId: String(info.messageId) };
  }

  if (cfg.MAIL_PROVIDER === 'gmail' || cfg.MAIL_PROVIDER === 'microsoft') {
    throw new Error(`${cfg.MAIL_PROVIDER} mailbox OAuth is configured as a stub until app credentials are supplied`);
  }

  throw new Error(`Unknown mail provider ${cfg.MAIL_PROVIDER}`);
}

export async function syncMailboxMetadata(_db: Database, _mailboxId: string): Promise<{ imported: number }> {
  return { imported: 0 };
}
