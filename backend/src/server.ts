import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { startCommunicationWorker } from './jobs/communicationWorker';

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`HR App API listening on port ${env.port} [${env.nodeEnv}]`);
});

startCommunicationWorker();

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
