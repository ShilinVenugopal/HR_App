import { v4 as uuid } from 'uuid';
import { UserStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  AccessTokenPayload,
  hashToken,
  refreshExpiryDate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { getUserAuthProfile } from '../users/permission.util';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

async function buildAccessTokenPayload(user: {
  id: string;
  email: string;
  name: string;
  role: AccessTokenPayload['role'];
}): Promise<AccessTokenPayload> {
  const profile = await getUserAuthProfile(user.id);
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    projects: profile.projects,
    permissions: profile.permissions,
  };
}

async function issueTokenPair(user: { id: string; email: string; name: string; role: AccessTokenPayload['role'] }, meta?: RequestMeta) {
  const payload = await buildAccessTokenPayload(user);
  const accessToken = signAccessToken(payload);

  const jti = uuid();
  const refreshToken = signRefreshToken(user.id, jti);
  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiryDate(),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.browser,
    },
  });

  return { accessToken, refreshToken, payload };
}

export async function login(email: string, password: string, meta?: RequestMeta) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await recordAuditLog({
      userEmail: email,
      action: 'FAILED_LOGIN',
      status: 'FAILURE',
      meta,
      details: { reason: 'no account with this email' },
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status !== UserStatus.ACTIVE) {
    await recordAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'FAILED_LOGIN',
      status: 'FAILURE',
      meta,
      details: { reason: 'account disabled' },
    });
    throw ApiError.unauthorized('Your account has been disabled. Contact your administrator.');
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    await recordAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'FAILED_LOGIN',
      status: 'FAILURE',
      meta,
      details: { reason: 'incorrect password' },
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  const { accessToken, refreshToken, payload } = await issueTokenPair(user, meta);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await recordAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'LOGIN',
    status: 'SUCCESS',
    meta,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      status: user.status,
      mustResetPassword: user.mustResetPassword,
    },
    projects: payload.projects,
    permissions: payload.permissions,
  };
}

export async function refreshSession(refreshToken: string, meta?: RequestMeta) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revoked || stored.expiresAt < new Date() || stored.userId !== decoded.sub) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw ApiError.unauthorized('Account is unavailable');
  }

  // Rotate: revoke the used refresh token, issue a fresh pair. This also
  // reloads the permission matrix from the DB, so admin changes to a
  // user's role/projects/permissions take effect on the next refresh.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const { accessToken, refreshToken: newRefreshToken, payload } = await issueTokenPair(user, meta);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      status: user.status,
      mustResetPassword: user.mustResetPassword,
    },
    projects: payload.projects,
    permissions: payload.permissions,
  };
}

export async function logout(userId: string, refreshToken: string | undefined, meta?: RequestMeta) {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({ where: { tokenHash, userId }, data: { revoked: true } });
  }

  await recordAuditLog({ userId, action: 'LOGOUT', status: 'SUCCESS', meta });
}

export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string, meta?: RequestMeta) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    await recordAuditLog({
      userId,
      userEmail: user.email,
      action: 'PASSWORD_RESET',
      status: 'FAILURE',
      meta,
      details: { reason: 'current password mismatch' },
    });
    throw ApiError.badRequest('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustResetPassword: false } });

  // Revoke all outstanding refresh tokens — a password change should end
  // every other active session.
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });

  await recordAuditLog({ userId, userEmail: user.email, action: 'PASSWORD_RESET', status: 'SUCCESS', meta });
}
