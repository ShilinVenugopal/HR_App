import { Server } from 'http';
import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { startCommunicationWorker } from './jobs/communicationWorker';
import { syncBuiltInWageTemplates } from './modules/projectWages/templateSync';
import { syncSiteAccountCostCodes } from './modules/siteAccounts/siteAccountCostCodeSync';

let server: Server;

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Shutting down gracefully...`);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
    return;
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/// Re-syncs built-in wage template column configs (nayaraTemplate.ts etc.)
/// into the DB on every boot, so a code-only column reorder takes effect
/// immediately — without this, WageProjectTemplate.columns stays whatever
/// it was when the row was last written (initial seed, or an earlier
/// deploy), silently drifting out of sync with the source config.
Promise.all([
  syncBuiltInWageTemplates().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to sync built-in wage templates:', err);
  }),
  syncSiteAccountCostCodes().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to sync Site Account cost codes:', err);
  }),
]).finally(() => {
  server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`HR App API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  startCommunicationWorker();
});
