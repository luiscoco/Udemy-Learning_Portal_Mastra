import { expect, test } from '@playwright/test';

// Streaming chat UI (L67): streamed reply, a responsive Stop, Retry, and history that survives a reload.
test('lab-67: stream, stop within a second, retry, and keep the history', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'writes the shared learner’s chat threads; desktop project only');
  test.setTimeout(90_000);
  await page.goto('/labs/lab-67?tab=run');
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log).toBeVisible();
  await expect(page.getByTestId('chat-status')).toHaveText('', { timeout: 15_000 });

  // A fresh thread, so earlier runs never interfere.
  await page.getByRole('button', { name: 'New thread' }).click();
  await expect(page.getByTestId('chat-status')).toHaveText('', { timeout: 15_000 });
  const thread = await page.locator('select[name="chatThread"]').inputValue();
  const messages = log.getByTestId('chat-message');
  const input = page.locator('#lab-67-chat-input');

  await input.fill('Hello chat');
  await input.press('Enter');
  await expect(page.getByTestId('chat-streaming')).toBeVisible();
  await expect(messages).toHaveCount(2, { timeout: 30_000 });
  await expect(messages.last()).toHaveAttribute('data-status', 'complete');
  await expect(messages.last()).toContainText('You said: "Hello chat"');

  // Slow tokens, then Stop: the panel reacts at once and keeps the partial reply as stopped.
  await page.locator('select[name="chatFault"]').selectOption('slow');
  await input.fill('Tell me a long story');
  await input.press('Enter');
  await expect(page.getByTestId('chat-streaming')).toContainText('You said', { timeout: 15_000 });
  const pressed = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  // Responsive: the stream ends and the stopped partial reply is on screen within 2 s of the click.
  await expect(messages.last()).toHaveAttribute('data-status', 'stopped', { timeout: 2_000 });
  expect(Date.now() - pressed).toBeLessThan(2_000);
  await expect(page.getByTestId('chat-streaming')).toHaveCount(0);
  await expect(page.getByTestId('chat-status')).toContainText('Stopped');

  // Retry replaces the stopped turn: the question appears once, followed by a complete reply.
  await page.locator('select[name="chatFault"]').selectOption('none');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(messages).toHaveCount(4, { timeout: 30_000 });
  await expect(messages.last()).toHaveAttribute('data-status', 'complete');
  await expect(log.locator('[data-role="user"]', { hasText: 'Tell me a long story' })).toHaveCount(1);

  // History lives in Mastra memory on the server: a reload shows the same thread.
  await page.reload();
  await expect(page.getByTestId('chat-status')).toHaveText('', { timeout: 15_000 });
  await page.locator('select[name="chatThread"]').selectOption(thread);
  await expect(messages).toHaveCount(4, { timeout: 15_000 });
  await expect(log.locator('[data-status="stopped"]')).toHaveCount(0);
});
