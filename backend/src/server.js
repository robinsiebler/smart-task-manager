const app = require('./app');
const config = require('./config/env');
const { initPool, closePool } = require('./config/db');

let server;

async function start() {
  await initPool();
  server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
