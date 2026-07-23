import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/apiError';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'A record with these details already exists.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }
    if (err.code === 'P2003') {
      return res
        .status(409)
        .json({ success: false, message: 'This record is referenced by other data and cannot be modified/deleted.' });
    }
  }

  // eslint-disable-next-line no-console
  console.error('[error]', err);

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(env.isProduction ? {} : { stack: err instanceof Error ? err.stack : String(err) }),
  });
}
