import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { TutorEvent } from '@mlp/contracts';
import { progressAccount, signInProgress } from './progress-helpers';

const frames = (events: TutorEvent[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
const liveSettings = {
  liveEnabled: true,
  models: [{ id: 'openai/gpt-4o-mini', provider: 'openai', configured: true }],
  questionLimit: 2000,
  answerLimit: 16000,
  timeoutMs: 60000,
};

test('AI Tutor gives real offline lesson guidance without changing progress and fits both themes', async ({ page }, info) => {
  test.setTimeout(120_000);
  const account = progressAccount(info, 'tutor');
  await signInProgress(page, account);
  const progressHeaders = { 'x-progress-subject': encodeURIComponent(`dev:${account}`) };
  const before = await (await page.request.get('/api/progress', { headers: progressHeaders })).json();
  await page.goto('/labs/lab-01');
  const launcher = page.getByRole('button', { name: 'AI Tutor', exact: true });
  await launcher.click();
  const panel = page.getByRole('dialog', { name: 'AI Tutor', exact: true });
  await expect(panel).toContainText('lab-01 · Create a Mastra project');
  await expect(panel.getByLabel('Tutor mode')).toHaveValue('offline');
  await panel.getByRole('button', { name: 'Give me a hint', exact: true }).click();
  await panel.getByRole('button', { name: 'Ask tutor', exact: true }).click();
  await expect(page.getByTestId('tutor-status')).toContainText('Complete');
  await expect(page.getByTestId('tutor-answer')).toContainText('First hint');
  await expect(page.getByTestId('tutor-answer')).not.toContainText('[object Object]');
  await panel.getByRole('button', { name: 'Debug my approach' }).click();
  await panel.getByRole('button', { name: 'Ask tutor', exact: true }).click();
  await expect(page.getByTestId('tutor-status')).toContainText('Complete');
  await expect(page.getByTestId('tutor-answer')).toContainText('Troubleshooting checklist');
  for (const theme of ['light', 'dark']) {
    await panel.getByRole('button', { name: 'Close AI Tutor' }).click();
    await expect(launcher).toBeFocused();
    const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
    if (await toggle.count()) await toggle.click();
    await launcher.click();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
    expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await page.getByTestId('tutor-answer').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.data/ai-tutor/${info.project.name}-${theme}-offline.png` });
  }
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  }
  await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
  const after = await (await page.request.get('/api/progress', { headers: progressHeaders })).json();
  expect(after).toEqual(before);
  await page.goto('/labs/lab-75');
  await launcher.click();
  await expect(page.getByRole('dialog')).toContainText('lab-75 · Enterprise AI Assistant capstone');
  await expect(page.getByTestId('tutor-status')).toHaveText('Ready');
});

test('AI Tutor live selection discloses charges and formats coloured code through the SSE client', async ({ page }, info) => {
  await signInProgress(page, progressAccount(info, 'tutor-live'));
  await page.route('**/api/tutor/settings', (route) => route.fulfill({ json: liveSettings }));
  let submitted: Record<string, unknown> = {};
  await page.route('**/api/tutor/answer', async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    const text =
      '## A small agent example\n\nGive the agent **clear instructions**.\n\n```typescript\nconst instructions: string = "Be helpful";\n```';
    await route.fulfill({
      contentType: 'text/event-stream',
      body: frames([
        {
          type: 'started',
          seq: 0,
          requestId: 't1',
          labId: 'lab-06',
          mode: 'live',
          simulated: false,
          modelId: 'openai/gpt-4o-mini',
        },
        { type: 'text', seq: 1, requestId: 't1', text: text.slice(0, -3) },
        { type: 'complete', seq: 2, requestId: 't1', text },
      ]),
    });
  });
  await page.goto('/labs/lab-06');
  await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('option', { name: 'Live · uses provider API tokens' })).toBeEnabled();
  await panel.getByLabel('Tutor mode').selectOption('live');
  await expect(panel.getByText(/may incur charges/)).toBeVisible();
  await panel.getByRole('button', { name: 'Ask live tutor' }).click();
  await expect(page.getByTestId('tutor-status')).toContainText('Complete · Live · openai/gpt-4o-mini');
  await expect(panel.getByRole('heading', { name: 'A small agent example' })).toBeVisible();
  await expect(panel.locator('pre .token.keyword').first()).toHaveText('const');
  await expect(panel.getByRole('button', { name: 'Copy code' })).toBeVisible();
  expect(submitted).toMatchObject({ labId: 'lab-06', mode: 'live', modelId: 'openai/gpt-4o-mini' });
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
  await page.getByTestId('tutor-answer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.data/ai-tutor/${info.project.name}-live-formatted-fixture.png` });
});

test('AI Tutor stops pending requests, retries explicitly and clears on navigation', async ({ page }, info) => {
  await signInProgress(page, progressAccount(info, 'tutor-lifecycle'));
  await page.route('**/api/tutor/settings', (route) => route.fulfill({ json: liveSettings }));
  let count = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/tutor/answer', async (route) => {
    count++;
    if (count === 1 || count === 3)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route
      .fulfill({
        contentType: 'text/event-stream',
        body: frames([
          { type: 'started', seq: 0, requestId: 't1', labId: 'lab-01', mode: 'offline', simulated: true, modelId: null },
          { type: 'complete', seq: 1, requestId: 't1', text: '**Done**' },
        ]),
      })
      .catch(() => undefined);
  });
  await page.goto('/labs/lab-01');
  await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
  await page.getByRole('button', { name: 'Ask tutor', exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await page.getByRole('button', { name: 'Stop receiving' }).click();
  await expect(page.getByTestId('tutor-status')).toContainText('Stopped receiving');
  release?.();
  await page.getByRole('button', { name: 'Retry question' }).click();
  await expect(page.getByTestId('tutor-status')).toContainText('Complete');
  expect(count).toBe(2);
  await page.getByRole('button', { name: 'Ask tutor', exact: true }).click();
  await expect.poll(() => count).toBe(3);
  await page.goto('/labs/lab-02');
  release?.();
  await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
  await expect(page.getByTestId('tutor-status')).toHaveText('Ready');
  await expect(page.getByTestId('tutor-answer')).not.toContainText('Done');
});
