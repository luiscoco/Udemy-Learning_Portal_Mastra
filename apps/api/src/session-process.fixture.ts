import express from 'express';
import { createAuth } from './auth.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';

const root = process.env.SESSION_TEST_ROOT!;
// Exercise the actual HTTP auth boundary without loading all 75 unrelated lab implementations.
// The Playwright restart scenario separately runs the complete bundled API and progress store.
const auth = createAuth(
  parseConfig({
    NODE_ENV: 'test',
    AUTH_SESSION_STORE: 'sqlite',
    AUTH_SESSION_SECRET: process.env.SESSION_TEST_SECRET,
    AUTH_DEV_USERS: 'alice,bob',
  }),
  createLogger('silent'),
  root,
);
await auth.ready;
const app = express();
app.use(express.json());
app.use(auth.middleware);
app.use('/api/auth', auth.router);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') process.send?.({ url: `http://127.0.0.1:${address.port}` });
});
process.on('message', (message) => {
  if (message !== 'stop') return;
  server.close(() => {
    process.exit(0);
  });
});
