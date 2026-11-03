import { expect, test } from '@playwright/test';

// Timeouts and failure testing (L65): faults are survived, and a hanging run never freezes the UI.
test('lab-65: injected faults are survived, and Cancel stops a run that waits on a hanging model', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-65?tab=run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  await expect(
    page.getByText('A dependency that kept failing was cut off by its breaker, and every question still got an answer').first(),
  ).toBeVisible();
  await expect(page.getByTestId('timeline')).toContainText('short-circuit');

  // A primary model that hangs, with a long timeout: progress keeps flowing and Cancel ends the run at once.
  await page.locator('select[name="primaryFault"]').selectOption('slow');
  await page.locator('input[name="modelTimeoutMs"]').fill('30000');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('timeline')).toContainText('primary #1', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run cancelled', { timeout: 10_000 });
});
