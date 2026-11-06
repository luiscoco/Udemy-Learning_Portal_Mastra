import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { ExecutionEventPayload } from '@mlp/contracts';
import { progressAccount, signInProgress } from './progress-helpers';

const reply = [
  '## Your first agent',
  '',
  'Use **clear instructions** and call `generate()`.',
  '',
  '1. Register the agent',
  '2. Run your prompt',
  '',
  '| Mode | Provider cost |',
  '| --- | --- |',
  '| Offline | Free |',
  '',
  '```typescript',
  'const ready: boolean = true;',
  `const prompt = "${'Learning '.repeat(35)}";`,
  '```',
  '',
  '> Keep your API key on the server.',
  '',
  '[Official documentation](https://mastra.ai/docs)',
  '',
  '<script>window.responseExecuted = true</script>',
  '',
  '![Agent diagram](https://response-image.invalid/pixel.png)',
].join('\n');

for (const mode of ['stream', 'checkpoint'] as const) {
  test(`assistant ${mode} formats prose and coloured code safely in both themes`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await signInProgress(page, progressAccount(info, `format-${mode}`));
    const errors: string[] = [];
    const imageRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('response-image.invalid')) imageRequests.push(request.url());
    });
    const runId = `format-${mode}`;
    await page.route('**/api/labs/lab-06/runs', (route) =>
      route.fulfill({
        status: 202,
        json: {
          runId,
          correlationId: 'format-correlation',
          requestId: 'format-request',
          runToken: 'format-token-0123456789abcdef',
        },
      }),
    );
    const events: ExecutionEventPayload[] = [
      ...(mode === 'stream' ? [{ type: 'token' as const, text: reply }] : []),
      {
        type: 'result',
        output: mode === 'stream' ? { text: reply } : { liveCheckpoint: { answer: reply } },
        validation: { passed: true, checks: [] },
      },
      { type: 'complete', status: 'succeeded', durationMs: 5 },
    ];
    await page.route(`**/api/runs/${runId}/events`, (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map(
            (event, seq) =>
              `id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify({ ...event, runId, correlationId: 'format-correlation', seq, timestamp: new Date().toISOString() })}\n\n`,
          )
          .join(''),
      }),
    );
    await page.goto('/labs/lab-06?tab=run');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('run-status')).toContainText('Run succeeded');
    const output = page.getByTestId(mode === 'stream' ? 'token-output' : 'complete-answer');
    await expect(output.getByRole('heading', { name: 'Your first agent' })).toBeVisible();
    await expect(output.locator('strong')).toHaveText('clear instructions');
    await expect(output.getByRole('table')).toContainText('Free');
    await expect(output.locator('pre .token.keyword').first()).toHaveText('const');
    expect(
      await output
        .locator('pre .token.keyword')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).not.toBe('rgb(171, 178, 191)');
    await expect(output.getByRole('button', { name: 'Copy code' })).toBeVisible();
    expect(await output.innerText()).not.toContain('```');
    expect(await page.evaluate(() => 'responseExecuted' in window)).toBe(false);
    expect(imageRequests).toEqual([]);
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await toggle.count()) await toggle.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
      await output.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.data/formatted-response/${info.project.name}-${theme}-${mode}.png` });
    }
    if (info.project.name === 'mobile') {
      await page.setViewportSize({ width: 320, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    }
    expect(errors).toEqual([]);
  });
}
