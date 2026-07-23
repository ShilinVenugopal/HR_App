import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/// Singleton Prisma client — prevents exhausting DB connections under
/// hot-reload (tsx watch) in development.
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.isProduction ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!env.isProduction) {
  global.__prisma = prisma;
}
