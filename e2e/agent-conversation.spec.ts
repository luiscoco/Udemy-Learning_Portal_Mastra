import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Two collaborating agents (L51): the Run tab shows every message, the planted slip and the final result.
test('lab-51: the agent conversation shows messages, intermediate outputs and the final result', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-51?tab=run');
  await page.getByLabel('Plant an editor slip in the first draft').selectOption('uncited-claim');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const conversation = page.getByTestId('agent-conversation');
  const messages = conversation.getByRole('list', { name: 'Messages' }).getByRole('listitem');
  await expect(messages).toHaveCount(7);
  await expect(messages.nth(2)).toContainText('planted by the lab');
  await messages.nth(3).locator('summary').click();
  await expect(conversation.getByLabel('Content of message 4')).toContainText('(uncited)');
  await expect(conversation.getByTestId('conversation-outcome')).toContainText('Published');
  await expect(conversation.getByTestId('conversation-outcome')).not.toContainText('spacecraft');

  const results = await new AxeBuilder({ page }).include('[data-testid="agent-conversation"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
