import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Research team capstone (L55): the learner approves publishing; evidence is surfaced and the planted claim is flagged.
test('lab-55: the learner approves, evidence is shown and the unsupported claim is withheld', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-55?tab=run');
  await page.getByLabel('Approval before publishing').selectOption('ask');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const panel = page.getByTestId('approval-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel).toContainText('1 flagged claim(s) will be withheld');
  await panel.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const cited = page.getByTestId('cited-answer');
  await expect(cited.getByRole('list', { name: 'Blocked claims' })).toContainText('GPU cluster');
  await cited
    .getByRole('button', { name: /^Open source 1:/ })
    .first()
    .click();
  await expect(page.getByTestId('source-passage').locator('mark')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('agent-conversation')).toContainText('Approved by you (Run tab) (learner)');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="cited-answer"]')
    .include('[data-testid="agent-conversation"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
