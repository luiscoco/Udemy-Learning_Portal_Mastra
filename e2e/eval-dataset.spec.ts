import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Evaluation dataset (L58): a pinned dataset version runs on the mock provider and every assertion is shown.
test('lab-58: revision 1 of the dataset runs on the mock provider with its assertions', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-58?tab=run');
  await page.getByLabel('Dataset revision to run').selectOption('1');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 90_000 });

  const report = page.getByTestId('eval-report');
  await expect(report).toContainText('mock provider (offline)');
  await expect(report.getByRole('list', { name: 'Dataset versions' })).toContainText('v3 = revision 1 (this run)');
  const scenarios = report.getByRole('list', { name: 'Scenarios' }).getByRole('listitem');
  await expect(scenarios).toHaveCount(3);
  await report.getByText('Suspend and resume').click();
  await expect(report.getByRole('list', { name: 'Assertions of Suspend and resume' })).toContainText(
    'fails: Mentions “resume” (not found)',
  );

  const results = await new AxeBuilder({ page }).include('[data-testid="eval-report"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
