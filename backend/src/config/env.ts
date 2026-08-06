import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    loginMax: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
  },

  seed: {
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL ?? 'admin@foraysgroup.com',
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe@12345',
  },

  appBaseUrl: process.env.APP_BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}`,

  // Bulk Communication providers — both optional. When unset, the
  // corresponding provider reports every send as failed with a clear
  // "not configured" reason instead of silently pretending to succeed.
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromAddress: process.env.SMTP_FROM_ADDRESS ?? process.env.SMTP_USER,
    fromName: process.env.SMTP_FROM_NAME ?? 'FORAYS ERP',
  },

  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v20.0',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  },

  communicationQueue: {
    pollIntervalMs: Number(process.env.COMM_QUEUE_POLL_INTERVAL_MS ?? 5000),
    batchSize: Number(process.env.COMM_QUEUE_BATCH_SIZE ?? 25),
    maxAttempts: Number(process.env.COMM_QUEUE_MAX_ATTEMPTS ?? 3),
  },
};
