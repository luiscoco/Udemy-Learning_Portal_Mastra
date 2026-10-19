import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Compare experiments (L59): three configurations on one dataset version, no fabricated cost, CSV download.
test('lab-59: configurations are compared against the baseline and the CSV downloads', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/labs/lab-59?tab=run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 120_000 });

  const cmp = page.getByTestId('experiment-comparison');
  const metrics = cmp.getByRole('table', { name: /Metrics per configuration/ });
  await expect(metrics.getByRole('row', { name: /No tools/ })).toContainText('0.25 (−0.5)');
  await expect(metrics.getByRole('row', { name: /No tools/ })).toContainText('not reported');
  await expect(
    cmp.getByRole('table', { name: /Outcome of each scenario/ }).getByRole('row', { name: /Workflow steps/ }),
  ).toContainText('regression');

  const download = page.waitForEvent('download');
  await cmp.getByRole('button', { name: 'Download CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^experiment-comparison-v\d+\.csv$/);

  const results = await new AxeBuilder({ page })
    .include('[data-testid="experiment-comparison"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
