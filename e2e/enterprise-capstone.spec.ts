import { expect, test } from '@playwright/test';

test('lab-75: approve an integrated request, inspect evidence and block an invented citation', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/labs/lab-75?tab=run');
  await page.getByLabel('Conversation thread').fill(`enterprise-${Date.now()}`);
  await page.getByLabel('Refund approval').selectOption('ask');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const approval = page.getByTestId('approval-panel');
  await expect(approval).toContainText('No real money moves.', { timeout: 60000 });
  await approval.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60000 });
  await expect(page.getByTestId('checks')).toContainText('Both agents ran');
  const citations = page.getByTestId('cited-answer');
  await expect(citations).toContainText('Refunds');
  await citations
    .getByRole('button', { name: /^Open source 1:/ })
    .first()
    .click();
  await expect(page.getByTestId('source-passage').locator('mark')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Citation fault').selectOption('bad-citation');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60000 });
  await expect(page.getByTestId('cited-answer').getByRole('list', { name: 'Blocked claims' })).toContainText('999 days');
  await expect(page.getByTestId('checks')).toContainText('No verified answer');
});

test('lab-75: unavailable case cannot create a refund', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/labs/lab-75?tab=run');
  await page.getByLabel('Conversation thread').fill(`foreign-${Date.now()}`);
  await page.getByLabel('Support case').selectOption('case-foreign');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60000 });
  await expect(page.getByTestId('checks')).toContainText('Case unavailable');
  await expect(page.getByTestId('approval-panel')).toHaveCount(0);
});
