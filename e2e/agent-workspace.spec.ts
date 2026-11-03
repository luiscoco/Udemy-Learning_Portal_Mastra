import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Interactive agent workspace (L70): documents, chat, live tasks, verified citations, tools, trace; responsive.
async function noSeriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual(
    [],
  );
}

async function noSideScroll(page: Page) {
  const width = await page.evaluate(() => Math.max(window.innerWidth, document.documentElement.scrollWidth));
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('lab-70: seed, ask, follow tasks, open a citation, inspect tools and trace, reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'writes the shared learner’s workspace thread; desktop project only');
  test.setTimeout(90_000);
  await page.goto('/labs/lab-70?tab=run');
  const status = page.getByTestId('ws-status');
  await expect(status).toHaveText('', { timeout: 15_000 });

  // Knowledge: seed (idempotent) and preview a document in an accessible dialog.
  await page.getByRole('button', { name: 'Seed sample documents' }).click();
  await expect(status).toContainText('Seeded', { timeout: 30_000 });
  const docs = page.getByRole('list', { name: 'Documents' });
  await docs.getByRole('button', { name: /refund-policy\.md/ }).click();
  const docDialog = page.getByRole('dialog', { name: 'refund-policy.md' });
  await expect(docDialog.getByTestId('doc-preview')).toContainText('within 5 business days');
  await page.keyboard.press('Escape');
  await expect(docDialog).toBeHidden();
  await expect(docs.getByRole('button', { name: /refund-policy\.md/ })).toBeFocused();

  // Ask: the answer is grounded, every task is done.
  await page.locator('#lab-70-ws-input').fill('How long do refunds take?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(status).toHaveText('', { timeout: 60_000 });
  const messages = page.getByRole('log', { name: 'Conversation' }).getByTestId('ws-message');
  await expect(messages.last()).toHaveAttribute('data-role', 'assistant');
  await expect(messages.last()).toContainText('Refunds are paid to the original payment method');
  const tasks = page.getByTestId('ws-tasks').getByRole('listitem');
  await expect(tasks).toHaveCount(3);
  for (const t of await tasks.all()) await expect(t).toHaveAttribute('data-status', 'done');

  // Inspector tabs work with the keyboard: Tasks → Citations.
  await page.getByRole('tab', { name: 'Tasks' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Citations' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Open source 1/ }).click();
  const source = page.getByTestId('source-passage');
  await expect(source.locator('mark')).toContainText('Refunds are paid');
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Tools' }).click();
  await expect(page.getByRole('list', { name: 'Tool calls' })).toContainText('searchDocs');
  await page.getByRole('tab', { name: 'Trace' }).click();
  await expect(page.getByTestId('timeline')).toContainText('complete — succeeded');
  await noSeriousViolations(page);
  await noSideScroll(page);

  // Reload: the thread and documents come back (other specs may append to the shared thread meanwhile).
  const count = await messages.count();
  await page.reload();
  await expect(status).toHaveText('', { timeout: 15_000 });
  await expect(messages.nth(count - 1)).toBeVisible({ timeout: 15_000 });
  await expect(messages.last()).toHaveAttribute('data-role', 'assistant');
  await expect(docs.getByRole('button', { name: /warranty\.md/ })).toBeVisible();
});

test('lab-70: one pane at a time on narrow screens, without sideways scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'pane switcher is for narrow screens');
  await page.goto('/labs/lab-70?tab=run');
  await expect(page.getByTestId('ws-status')).toHaveText('', { timeout: 15_000 });
  const panes = page.getByRole('group', { name: 'Show pane' });
  await expect(page.getByTestId('pane-chat')).toBeVisible();
  await expect(page.getByTestId('pane-knowledge')).toBeHidden();
  for (const name of ['Knowledge', 'Inspector', 'Chat'] as const) {
    await panes.getByRole('button', { name }).click();
    await expect(panes.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`pane-${name.toLowerCase()}`)).toBeVisible();
    await noSideScroll(page);
  }
  await noSeriousViolations(page);
});
