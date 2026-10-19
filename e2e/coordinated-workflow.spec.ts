import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Coordinated agent workflow (L54): retried attempts are visible and the outcome is contained.
test('lab-54: a transient outage is retried with backoff and the trace is stable', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-54?tab=run');
  await page.getByLabel('Fault').selectOption('transient-diagnosis');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const conversation = page.getByTestId('agent-conversation');
  const messages = conversation.getByRole('list', { name: 'Messages' }).getByRole('listitem');
  await expect(messages.filter({ hasText: 'Attempt 1 failed: PROVIDER_503 (simulated fault), retrying' })).toHaveCount(1);
  await expect(messages.filter({ hasText: 'Attempt 3 succeeded' })).toHaveCount(1);
  await expect(conversation.getByTestId('conversation-outcome')).toContainText('Published');
  await expect(page.getByTestId('checks')).toContainText('Repeated runs of the same input produce the same step trace');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="agent-conversation"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
