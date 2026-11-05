import { expect, test } from '@playwright/test';

// A fresh public home must not inherit the shared learner's server-saved progress.
test.use({ storageState: { cookies: [], origins: [] } });

test('home loads and reports a healthy offline API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build production AI agents with Mastra');
  await expect(page.getByTestId('api-status')).toHaveText('ok');
  await expect(page.getByRole('link', { name: /Start Dummy Lab 00/ })).toBeVisible();
});

test('API health is reachable from the web origin', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect((await res.json()).status).toBe('ok');
});
