import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { progressAccount, signInProgress } from './progress-helpers';

test('audio end times advance red regions and source ranges, with mobile reading focus', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signInProgress(page, progressAccount(info, 'narration'));
  for (const tab of ['infographic', 'source']) {
    await page.goto(`/labs/lab-03?tab=${tab}`);
    await page.getByRole('button', { name: 'Start Guided Narrated Learning Tour', exact: true }).click();
    const reader = page.getByRole('dialog');
    await reader.getByLabel('Continue after audio').check();
    await reader.getByRole('button', { name: 'Play narration', exact: true }).click();
    const player = reader.getByLabel('Guided tour recorded narration');
    await expect.poll(() => player.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 30_000 }).toBeGreaterThan(0.1);
    if (info.project.name === 'mobile') {
      const captions = reader.getByRole('region', { name: 'Timed narration captions' });
      await expect.poll(() => captions.evaluate((el) => el.getBoundingClientRect().top < innerHeight - 80)).toBe(true);
      await expect(reader.getByRole('button', { name: 'Pause followed audio' })).toBeVisible();
      await page.screenshot({ path: `.data/narrated-tours/${info.project.name}-following-${tab}.png` });
    }
    const previousLine =
      tab === 'source' ? await reader.locator('[data-tour-first="true"]').getAttribute('data-tour-line') : null;
    await player.evaluate((el: HTMLAudioElement) => {
      el.currentTime = el.duration - 0.1;
    });
    await expect(reader.getByLabel('Tour section', { exact: true })).toHaveValue('1', { timeout: 20_000 });
    if (tab === 'infographic') await expect(reader.locator('rect[data-tour-focus]')).toHaveAttribute('y', '432');
    else expect(await reader.locator('[data-tour-first="true"]').getAttribute('data-tour-line')).not.toBe(previousLine);
    await reader.getByRole('button', { name: 'Close tour' }).click();
  }
});

test('recorded Inworld tours play, focus timed text and diagrams, and fit both themes', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signInProgress(page, progressAccount(info, 'narration'));
  let runs = 0,
    external = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/runs$/.test(new URL(r.url()).pathname)) runs++;
    if (new URL(r.url()).hostname.endsWith('inworld.ai')) external++;
  });
  for (const tab of ['run', 'source', 'infographic', 'walkthrough']) {
    await page.goto(`/labs/lab-03?tab=${tab}`);
    const launch = page.getByRole('button', { name: 'Start Guided Narrated Learning Tour', exact: true });
    await launch.click();
    const reader = page.getByRole('dialog', { name: 'lab-03 Guided Narrated Learning Tour' });
    await expect(reader).toBeVisible();
    const player = reader.getByLabel('Guided tour recorded narration');
    expect(await player.getAttribute('src')).toBeNull();
    await reader.getByRole('button', { name: 'Play narration', exact: true }).click();
    await expect.poll(() => player.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 30_000 }).toBeGreaterThan(0.1);
    await expect(reader.locator('[data-current-word="true"]')).toHaveCount(1);
    await reader.getByRole('button', { name: 'Pause narration' }).click();
    expect(await player.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
    await reader.getByLabel('Tour playback speed').selectOption('1.5');
    expect(await player.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(1.5);
    if (tab === 'source') {
      await reader.getByLabel('Tour section', { exact: true }).selectOption('3');
      const source = reader.getByLabel('Narrated TypeScript source');
      await expect.poll(() => source.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await source.locator('[data-tour-highlight="true"]').count()).toBeGreaterThan(0);
      expect(await reader.getByText('hidden solution', { exact: true }).count()).toBe(0);
    } else if (tab === 'run') {
      await reader.getByLabel('Tour section', { exact: true }).selectOption('5');
      await expect
        .poll(() => reader.getByRole('region', { name: 'Narrated exercise sections' }).evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      await expect(reader.getByLabel('Continue after audio')).toHaveCount(0);
    } else {
      await reader.getByRole('button', { name: '100%', exact: true }).click();
      await reader.getByLabel('Tour section', { exact: true }).selectOption('3');
      await expect(reader.locator('rect[data-tour-focus]')).toHaveCount(1);
      await expect
        .poll(() => reader.getByRole('region', { name: 'Narrated infographic image' }).evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
    }
    await reader.getByLabel('Follow narration').uncheck();
    await expect(reader.getByLabel('Follow narration')).not.toBeChecked();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
        .violations;
      expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      await page.screenshot({ path: `.data/narrated-tours/${info.project.name}-${tab}-${theme}.png` });
    }
    await page.keyboard.press('Escape');
    await expect(reader).not.toBeVisible();
    await expect(launch).toBeFocused();
  }
  expect(runs).toBe(0);
  expect(external).toBe(0);
});

test('tours preserve running exercises, scratch drafts and solution boundaries', async ({ page }, info) => {
  await signInProgress(page, progressAccount(info, 'narration-state'));
  await page.goto('/labs/lab-00?tab=run');
  const input = page.getByRole('textbox', { name: 'Message (required)', exact: true });
  await input.fill('keep '.repeat(32).trim());
  await page.getByLabel('Delay per token (ms)').fill('900');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('token-output')).toContainText('Echo');
  await page.getByRole('button', { name: 'Start Guided Narrated Learning Tour', exact: true }).click();
  const reader = page.getByRole('dialog');
  await reader.getByRole('button', { name: 'Next section' }).click();
  await reader.getByRole('button', { name: 'Close tour' }).click();
  await expect(input).toHaveValue('keep '.repeat(32).trim());
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('run-status')).toContainText('cancelled');
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await page.getByLabel('Your scratchpad').fill('my draft stays');
  await page.getByRole('button', { name: 'Start Guided Narrated Learning Tour', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close tour' }).click();
  await expect(page.getByLabel('Your scratchpad')).toHaveValue('my draft stays');
  await expect(page.getByRole('button', { name: 'Reveal solution', exact: true })).toBeVisible();
});

test('corrupt or unavailable audio leaves manual captions and navigation usable', async ({ page }, info) => {
  await signInProgress(page, progressAccount(info, 'narration-errors'));
  await page.goto('/labs/lab-03?tab=infographic');
  await page.route('**/audio/tours/*.mp3', (r) =>
    r.fulfill({ status: 200, body: 'corrupt recording', contentType: 'audio/mpeg' }),
  );
  await page.getByRole('button', { name: 'Start Guided Narrated Learning Tour', exact: true }).click();
  const reader = page.getByRole('dialog');
  await reader.getByRole('button', { name: 'Play narration', exact: true }).click();
  await expect(reader.getByRole('status')).toContainText('could not play');
  expect(await reader.getByLabel('Guided tour recorded narration').getAttribute('src')).toBeNull();
  await expect(reader.getByText('Complete section transcript')).toBeVisible();
  await reader.getByRole('button', { name: 'Next section' }).click();
  await expect(reader.getByLabel('Tour section', { exact: true })).toHaveValue('1');
  await page.unroute('**/audio/tours/*.mp3');
  await reader.getByRole('button', { name: 'Play narration', exact: true }).click();
  await expect
    .poll(() => reader.getByLabel('Guided tour recorded narration').evaluate((el: HTMLAudioElement) => el.currentTime), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0.1);
});
