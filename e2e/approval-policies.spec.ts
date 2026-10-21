import { expect, test } from '@playwright/test';

// Tool approval policies (L64): the learner confirms two actions; the denied one never reaches them.
test('lab-64: policy denies, the learner confirms each allowed action, and the audit verifies', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-64?tab=run');
  await page.locator('select[name="userDecision"]').selectOption('ask');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const panel = page.getByTestId('approval-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel).toContainText('issueRefund');
  await expect(panel).toContainText('large-refund');
  await panel.getByRole('button', { name: 'Approve', exact: true }).click();

  await expect(panel).toContainText('changeEmail', { timeout: 30_000 });
  await panel.getByRole('button', { name: 'Decline', exact: true }).click();

  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  await expect(page.getByText('Denied and declined actions were never invoked').first()).toBeVisible();
  await expect(page.getByText(/closeAccount: default → deny/).first()).toBeVisible();
});
