import { expect, test } from '@playwright/test';

// Untrusted input (L63): a poisoned document compromises the baseline, never the protected agent.
test('lab-63: injected instructions cause no unapproved side effect, and only the customer’s action is approved', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-63?tab=run');
  await page.locator('select[name="userDecision"]').selectOption('ask');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // Only the authorized summary email reaches the approver; the injected calls were denied by policy.
  const approval = page.getByTestId('approval-panel');
  await expect(approval).toBeVisible({ timeout: 60_000 });
  await expect(approval).toContainText('sendEmail');
  await expect(approval).toContainText('sam@customer.example');
  await approval.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(approval).toBeHidden();

  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  await expect(page.getByText('Every write call the customer did not ask for was denied before it ran').first()).toBeVisible();
  await expect(page.getByText(/baseline compromised: 2 unrequested side effect/).first()).toBeVisible();
});
