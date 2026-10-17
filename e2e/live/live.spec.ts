import { expect, test } from '@playwright/test';

// Live UI test: real provider calls through the browser → API (MASTRA_MODE=live) → Mastra → provider.
// Runs only with E2E_LIVE=1 (npm run test:e2e:live); uses the keys in the repo-root .env.

test('lab-03 runs live from the browser and shows a real (non-simulated) answer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-03?tab=run');
  await expect(page.getByText('Live mode configured (optional)')).toBeVisible();
  const live = page.getByRole('radio', { name: /Live/ });
  await expect(live).toBeEnabled();
  await live.check();
  await expect(page.getByTestId('cost-notice')).toContainText('Cost notice:');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 100_000 });
  const output = page.getByLabel('Run output');
  await expect(output).toContainText('"simulated": false');
  await expect(output).not.toContainText('[simulated');
  await expect(page.getByLabel('Effective options')).toContainText('"simulated": false');
});

test('lab-06 live answer records real request metadata', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-06?tab=run');
  await page.getByRole('radio', { name: /Live/ }).check();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 100_000 });
  const output = page.getByLabel('Run output');
  await expect(output).toContainText('"usedFallback": false');
  await expect(output).toContainText('"simulated": false');
  await expect(output).toContainText('"finishReason"');
});
