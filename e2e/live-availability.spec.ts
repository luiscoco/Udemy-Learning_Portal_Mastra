import { expect, test } from '@playwright/test';

test('all lesson definitions support live execution and the scaffold Live control is enabled', async ({ page }) => {
  const response = await page.request.get('/api/labs');
  expect(response.ok()).toBe(true);
  const labs = (await response.json()) as { id: string; modes: string[] }[];
  expect(labs).toHaveLength(76);
  for (const lab of labs) expect(lab.modes, lab.id).toContain('live');
  await page.goto('/labs/lab-01?tab=run');
  const live = page.getByRole('radio', { name: 'Live (real provider, may cost money)', exact: true });
  await expect(live).toBeEnabled();
  await live.check();
  await expect(page.getByTestId('cost-notice')).toContainText('provider charges apply');
  await expect(page.getByTestId('cost-notice')).toContainText('redacted excerpt');
  await expect(page.getByLabel('Live checkpoint model')).toHaveValue('auto');
  // CI is intentionally offline. Selecting the mode here does not authorize a paid model call.
});
