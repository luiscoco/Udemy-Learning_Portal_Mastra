import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Agent handoffs (L52): the conversation shows the refused cycle and the escalation.
test('lab-52: a ping-pong handoff is refused as a cycle and escalated', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-52?tab=run');
  await page.getByLabel('Routing fault').selectOption('ping-pong');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const conversation = page.getByTestId('agent-conversation');
  const messages = conversation.getByRole('list', { name: 'Messages' }).getByRole('listitem');
  await expect(messages.nth(2)).toContainText('Handoff 1/3 accepted: triage → billing');
  await messages.nth(2).locator('summary').click();
  await expect(conversation.getByLabel('Content of message 3')).toContainText('"orderId":"ORD-7781"');
  await expect(conversation.getByLabel('Content of message 3')).not.toContainText('4111');
  await expect(conversation.getByTestId('conversation-outcome')).toContainText('Needs a human');
  await expect(conversation.getByTestId('conversation-outcome')).toContainText('cycle');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="agent-conversation"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
