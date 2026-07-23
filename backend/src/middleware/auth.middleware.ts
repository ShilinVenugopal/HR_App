import { NextFunction, Request, Response } from 'express';
import { UserStatus } from '@prisma/client';
import { ApiError } from '../utils/apiError';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { extractRequestMeta } from '../utils/requestMeta';

/// Authentication middleware — the first line of defense.
/// Verifies the JWT, then performs a single indexed lookup to confirm the
/// user still exists and is ACTIVE (so a disabled/deleted user is locked
/// out immediately, even though their permission matrix stays cached in
/// the token). This is the only per-request DB call in the auth path.
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  req.meta = extractRequestMeta(req);

  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or invalid Authorization header');
    }

    const token = header.slice('Bearer '.length);
    const payload = verifyAccessToken(token);
    req.user = payload;

    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });

    if (!dbUser || dbUser.status !== UserStatus.ACTIVE) {
      req.auditContext = { reason: 'account disabled or deleted' };
      throw ApiError.unauthorized('Account is disabled. Contact your administrator.');
    }

    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(ApiError.unauthorized('Invalid or expired session. Please log in again.'));
  }
}
