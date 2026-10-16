import { expect, test } from '@playwright/test';

test('home loads and reports a healthy offline API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Mastra Learning Platform' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText('ok');
  await expect(page.getByText('Dummy Lab 00')).toBeVisible();
});

test('API health is reachable through the web proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect((await res.json()).status).toBe('ok');
});
