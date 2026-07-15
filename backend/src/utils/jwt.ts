import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { Role } from '@prisma/client';

export interface PermissionClaim {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

/// Everything the app needs to authorize a request, embedded in the access
/// token so permissions are not re-fetched from the DB on every call.
/// Reloaded only on login or explicit refresh (e.g. after an admin edits
/// this user's role/projects/permissions and the user re-authenticates).
export interface TokenProject {
  id: string;
  projectName: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  projects: TokenProject[];
  permissions: Record<string, PermissionClaim>;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.jwt.refreshExpiresIn);
  const amount = match ? Number(match[1]) : 7;
  const unit = match ? match[2] : 'd';
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return new Date(Date.now() + amount * multiplier);
}
