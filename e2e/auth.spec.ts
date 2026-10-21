import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('anonymous run refusal, sign-in return, reload and logout', async ({ page, request }) => {
  const refused = await request.post('/api/labs/lab-00/runs', { data: { input: { message: 'blocked' } } });
  expect(refused.status()).toBe(401);
  await page.goto('/labs/lab-00?tab=run');
  await expect(page.getByRole('heading', { name: 'Sign in to run labs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Sign in to continue' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.getByLabel('User name').fill('invalid/name');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(await page.getByLabel('User name').evaluate((el) => (el as HTMLInputElement).validity.patternMismatch)).toBe(true);
  await page.getByLabel('User name').fill('unknown');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid user name or passcode.');
  await page.getByLabel('User name').fill('learner');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/labs\/lab-00\?tab=run$/);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to run labs' })).toBeVisible();
  const session = await page.request.get('/api/auth/session');
  expect((await session.json()).authenticated).toBe(false);
});

test('server-side logout is noticed when a stale tab attempts to run', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: { username: 'learner' } });
  await page.goto('/labs/lab-00?tab=run');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await page.request.post('/api/auth/logout');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to run labs' })).toBeVisible();
});
