import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`QuickBite server listening on port ${config.port} [env=${config.nodeEnv}]`);
});

// Graceful termination
const shutdown = () => {
  console.log('Shutting down QuickBite server...');
  server.close(() => {
    console.log('QuickBite server stopped.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
