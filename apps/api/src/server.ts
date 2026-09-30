import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { prisma } from './db.js';

const config = loadConfig();
const app = await buildApp({ config, prisma, startJobs: true });

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}
process.once('SIGINT', (s) => void shutdown(s));
process.once('SIGTERM', (s) => void shutdown(s));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.fatal({ err }, 'failed to start');
  await prisma.$disconnect();
  process.exit(1);
}
