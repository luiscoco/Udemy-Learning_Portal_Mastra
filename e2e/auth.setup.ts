import { mkdir } from 'node:fs/promises';
import { expect, test as setup } from '@playwright/test';

setup('sign in to the local test server', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: { username: 'learner' } });
  expect(res.status()).toBe(200);
  await mkdir('e2e/.auth', { recursive: true });
  await request.storageState({ path: 'e2e/.auth/learner.json' });
});
