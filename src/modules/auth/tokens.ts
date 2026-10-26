import { SignJWT, jwtVerify } from 'jose';
import { getConfig } from '../../config';

export interface AuthClaims {
  sub: string;
  firmId: string;
  role: string;
  email: string;
  name: string;
  partnerId?: string;
}

export async function signAccessToken(claims: AuthClaims): Promise<string> {
  const cfg = getConfig();
  const secret = new TextEncoder().encode(cfg.JWT_SECRET);
  return new SignJWT({
    firmId: claims.firmId,
    role: claims.role,
    email: claims.email,
    name: claims.name,
    partnerId: claims.partnerId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${cfg.JWT_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AuthClaims> {
  const cfg = getConfig();
  const secret = new TextEncoder().encode(cfg.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: String(payload.sub),
    firmId: String(payload.firmId),
    role: String(payload.role),
    email: String(payload.email),
    name: String(payload.name),
    partnerId: payload.partnerId ? String(payload.partnerId) : undefined,
  };
}
