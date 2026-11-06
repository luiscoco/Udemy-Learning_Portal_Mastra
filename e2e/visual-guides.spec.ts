import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { progressAccount, signInProgress } from './progress-helpers';

test('Mastra visual tabs have checked code and fit both themes without changing progress', async ({ page }, info) => {
  test.setTimeout(180_000);
  const account = progressAccount(info, 'visual-guides');
  await signInProgress(page, account);
  const headers = { 'x-progress-subject': encodeURIComponent(`dev:${account}`) };
  const before = await (await page.request.get('/api/progress', { headers })).json();
  let runs = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/runs$/.test(new URL(req.url()).pathname)) runs++;
  });
  for (const theme of ['light', 'dark']) {
    for (const id of ['lab-03', 'lab-26', 'lab-75'])
      for (const kind of ['infographic', 'walkthrough']) {
        await page.goto(`/labs/${id}?tab=${kind}`);
        const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
        if (await toggle.count()) await toggle.click();
        const name = kind === 'infographic' ? 'Infographic Content' : 'Exercise Walkthrough';
        await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
        const panel = page.getByRole('tabpanel', { name, exact: true });
        await expect(panel.getByLabel(`${id} ${kind} teaching excerpt`)).toBeVisible();
        await expect(panel.getByRole('img')).toHaveAccessibleName(new RegExp(id));
        expect(await panel.locator('svg tspan[fill]').count()).toBeGreaterThan(5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(
          scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          `${theme}/${id}/${kind}`,
        ).toEqual([]);
        if (id === 'lab-03') {
          await panel.locator('.poster-viewport').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `.data/visual-guides/${info.project.name}-${theme}-${kind}.png` });
        }
      }
  }
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
  const after = await (await page.request.get('/api/progress', { headers })).json();
  expect(after).toEqual(before);
  expect(runs).toBe(0);
  await page.goto('/?lesson=lab-03&tab=infographic');
  await expect(page.getByRole('tab', { name: 'Infographic Content', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Infographic Content', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Exercise Walkthrough', exact: true })).toBeFocused();
});

test('walkthrough navigation preserves active runs, learner input and source reveal state', async ({ page }, info) => {
  await signInProgress(page, progressAccount(info, 'visual-guides-state'));
  await page.goto('/labs/lab-00?tab=run');
  await page.getByRole('textbox', { name: 'Message (required)', exact: true }).fill('keep '.repeat(32).trim());
  await page.getByLabel('Delay per token (ms)').fill('900');
  let runs = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/labs\/lab-00\/runs$/.test(new URL(req.url()).pathname)) runs++;
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('token-output')).toContainText('Echo');
  await page.getByRole('tab', { name: 'Exercise Walkthrough', exact: true }).click();
  const guide = page.getByRole('tabpanel', { name: 'Exercise Walkthrough', exact: true });
  await guide.getByRole('button', { name: 'Next step', exact: true }).click();
  await guide.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('tab', { name: 'Infographic Content', exact: true }).click();
  await page.getByRole('tab', { name: 'Exercise Walkthrough', exact: true }).click();
  await expect(guide.getByRole('article', { name: 'Run a baseline' })).toBeVisible();
  await guide.getByRole('button', { name: 'Open Run', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message (required)', exact: true })).toHaveValue('keep '.repeat(32).trim());
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('run-status')).toContainText('Run cancelled');
  expect(runs).toBe(1);
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reveal solution', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Exercise Walkthrough', exact: true }).click();
  await guide.getByRole('button', { name: 'Explain and record', exact: true }).click();
  await guide.getByRole('button', { name: 'Open My notes' }).click();
  await expect(page.getByLabel('Notes for lab-00')).toBeFocused();
});

test('infographic zoom, fullscreen and original SVG/PNG/text downloads work', async ({ page }, info) => {
  await signInProgress(page, progressAccount(info, 'visual-guides-export'));
  await page.goto('/labs/lab-03?tab=infographic');
  const panel = page.getByRole('tabpanel', { name: 'Infographic Content', exact: true });
  await expect(panel.getByLabel('lab-03 infographic teaching excerpt')).toBeVisible();
  await panel.getByRole('button', { name: '100%', exact: true }).click();
  const viewport = panel.getByRole('region', { name: 'Scrollable infographic', exact: true });
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await panel.getByRole('button', { name: 'Fit', exact: true }).click();
  const full = panel.getByRole('button', { name: 'Fullscreen', exact: true });
  await full.click();
  await expect(page.getByRole('dialog', { name: 'lab-03 concept map fullscreen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(full).toBeFocused();
  for (const format of ['SVG', 'PNG', 'text']) {
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: `Download ${format}`, exact: true }).click();
    const file = await download;
    const extension = format === 'SVG' ? 'svg' : format === 'PNG' ? 'png' : 'md';
    expect(file.suggestedFilename()).toBe(`lab-03-infographic.${extension}`);
    const path = `.data/visual-guides/${info.project.name}-export.${extension}`;
    await file.saveAs(path);
    const data = await readFile(path);
    if (format === 'PNG') {
      expect(data.readUInt32BE(16)).toBe(1920);
      expect(data.readUInt32BE(20)).toBe(1080);
    } else if (format === 'SVG') {
      expect(data.toString()).toContain('MASTRA AI AGENTS 2026');
      expect(data.toString()).not.toMatch(/<image\b|<foreignObject\b|<script\b/);
    } else {
      expect(data.toString()).toContain('Create and register a first agent');
      expect(data.toString()).toContain('```typescript');
    }
  }
});
