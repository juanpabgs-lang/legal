import { randomBytes, randomUUID } from 'node:crypto';

export function uuid(): string {
  return randomUUID();
}

export function token(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function apiKeyPlain(): { prefix: string; secret: string; full: string } {
  const secret = token(24);
  const prefix = `nf_${secret.slice(0, 8)}`;
  return { prefix, secret, full: `nf_${secret}` };
}
