import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Supervisor pattern (L53): a runaway supervisor is refused by the budget guard and stopped at its cap.
test('lab-53: a runaway supervisor is refused and stopped, with every decision shown', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-53?tab=run');
  await page.getByLabel('Supervisor fault').selectOption('runaway');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const conversation = page.getByTestId('agent-conversation');
  const messages = conversation.getByRole('list', { name: 'Messages' }).getByRole('listitem');
  await expect(messages.filter({ hasText: 'Delegation 1/4 accepted' })).toHaveCount(1);
  await expect(messages.filter({ hasText: 'per-worker-cap' }).first()).toBeVisible();
  await expect(conversation.getByTestId('conversation-outcome')).toContainText('Needs a human');
  await expect(messages.last()).toContainText('Stopped at the iteration cap (6 steps)');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="agent-conversation"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
