import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { apiKeys, partners, users } from '../../db/schema';
import { ROLE_RANK, type UserRole } from '../../domain/taxonomy';
import { forbidden, unauthorized } from '../../lib/errors';
import { apiKeyPlain } from '../../lib/ids';
import { hashPassword, sha256, verifyPassword } from '../../lib/crypto';
import { signAccessToken, verifyAccessToken, type AuthClaims } from './tokens';

export interface AuthedUser {
  id: string;
  firmId: string;
  role: UserRole;
  email: string;
  name: string;
  partnerId?: string;
}

export function hasRole(user: AuthedUser, minimum: UserRole): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

export function assertRole(user: AuthedUser, minimum: UserRole): void {
  if (!hasRole(user, minimum)) throw forbidden(`Requires role ${minimum}`);
}

export async function login(db: Database, email: string, password: string): Promise<{ token: string; user: AuthedUser }> {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  const user = rows.find((u) => u.active);
  if (!user) throw unauthorized('Invalid email or password');
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw unauthorized('Invalid email or password');
  const partner = await db.select().from(partners).where(eq(partners.userId, user.id)).limit(1);
  const authed: AuthedUser = {
    id: user.id,
    firmId: user.firmId,
    role: user.role,
    email: user.email,
    name: user.name,
    partnerId: partner[0]?.id,
  };
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  const token = await signAccessToken({
    sub: authed.id,
    firmId: authed.firmId,
    role: authed.role,
    email: authed.email,
    name: authed.name,
    partnerId: authed.partnerId,
  });
  return { token, user: authed };
}

export async function createApiKey(db: Database, user: AuthedUser, name: string) {
  const issued = apiKeyPlain();
  const [row] = await db
    .insert(apiKeys)
    .values({
      firmId: user.firmId,
      userId: user.id,
      name,
      prefix: issued.prefix,
      hash: sha256(issued.full),
    })
    .returning();
  return { id: row.id, prefix: row.prefix, key: issued.full, name: row.name };
}

export async function resolveBearer(db: Database, header: string | undefined): Promise<AuthedUser> {
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const token = header.slice(7).trim();
  if (token.startsWith('nf_')) return resolveApiKey(db, token);
  try {
    const claims = await verifyAccessToken(token);
    return claimsToUser(claims);
  } catch {
    throw unauthorized('Invalid token');
  }
}

export function claimsToUser(claims: AuthClaims): AuthedUser {
  return {
    id: claims.sub,
    firmId: claims.firmId,
    role: claims.role as UserRole,
    email: claims.email,
    name: claims.name,
    partnerId: claims.partnerId,
  };
}

async function resolveApiKey(db: Database, key: string): Promise<AuthedUser> {
  const prefix = `nf_${key.replace(/^nf_/, '').slice(0, 8)}`;
  const rows = await db
    .select({ key: apiKeys, user: users, partnerId: partners.id })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .leftJoin(partners, eq(partners.userId, users.id))
    .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)));
  const match = rows.find((row) => row.key.hash === sha256(key) && row.user.active);
  if (!match) throw unauthorized('Invalid API key');
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, match.key.id));
  return {
    id: match.user.id,
    firmId: match.user.firmId,
    role: match.user.role,
    email: match.user.email,
    name: match.user.name,
    partnerId: match.partnerId ?? undefined,
  };
}

export async function hashForUser(password: string): Promise<string> {
  return hashPassword(password);
}
