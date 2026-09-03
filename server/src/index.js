/** Server entry point: open storage, start listening, shut down cleanly. */
import { config, describeConfig } from './env.js';
import { openRepo } from './storage/index.js';
import { createApp } from './app.js';

async function main() {
  const repo = await openRepo();
  const app = createApp(repo);

  const server = app.listen(config.port, config.host, () => {
    console.log(`\n  Expense Manager API\n  ${describeConfig()}\n`);
    if (config.ephemeralSecret) {
      console.log('  note        JWT_SECRET is unset, so a temporary one was generated.');
      console.log('              Sessions end when the server restarts. Set JWT_SECRET in .env to keep them.\n');
    }
  });

  const shutdown = async (signal) => {
    console.log(`\n  ${signal} received — saving and shutting down.`);
    server.close();
    try {
      await repo.close?.();
    } catch (error) {
      console.error('  storage did not close cleanly:', error.message);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown('SIGINT'); });
  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
}

main().catch((error) => {
  console.error('\n  Failed to start the API:\n  ', error.message, '\n');
  process.exit(1);
});
