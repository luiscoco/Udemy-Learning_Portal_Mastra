import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { progressAccount, signInProgress } from './progress-helpers';

test('course surfaces remain readable and fit the viewport in both themes', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signInProgress(page, progressAccount(info, 'visual'));
  const views = [
    { name: 'home', path: '/' },
    { name: 'learn', path: '/labs/lab-01' },
    { name: 'run', path: '/labs/lab-01?tab=run' },
    { name: 'source', path: '/labs/lab-01?tab=source' },
    { name: 'workflow', path: '/labs/lab-68?tab=run' },
  ];
  for (const theme of ['light', 'dark'] as const) {
    for (const view of views) {
      await page.goto(view.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await toggle.count()) await toggle.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('sans-serif');
      if (view.name !== 'home') {
        await expect(page.getByRole('tab', { name: 'Learn', exact: true })).toBeVisible();
        await expect(
          page.getByRole('tab', {
            name: view.name === 'source' ? 'Source' : view.name === 'learn' ? 'Learn' : 'Run',
            exact: true,
          }),
        ).toHaveAttribute('aria-selected', 'true');
      }
      if (view.name === 'workflow') {
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await expect(page.getByTestId('run-status')).toContainText('Run succeeded', { timeout: 30_000 });
      }
      if (view.name === 'source')
        await expect(page.getByRole('heading', { name: 'Reference source', exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${theme}/${view.name} page overflow`).toBe(false);
      if (view.name === 'home') await page.getByRole('link', { name: 'Browse the course map' }).hover();
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(
        scan.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })),
        `${theme}/${view.name} accessibility`,
      ).toEqual([]);
      if (view.name === 'learn')
        await page.screenshot({ path: `.data/portal-style/${info.project.name}-${theme}-lesson-header.png` });
      if (view.name !== 'home') await page.locator('.lesson-tabs').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({
        path: `.data/portal-style/${info.project.name}-${theme}-${view.name}.png`,
        fullPage: view.name === 'home',
      });
    }
  }
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/labs/lab-01?tab=run');
    await expect(page.getByRole('tab', { name: 'Run', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), '320px page overflow').toBe(
      false,
    );
    await page.getByRole('button', { name: 'Open course menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Course menu' })).toBeVisible();
    await page.screenshot({ path: '.data/portal-style/mobile-320-menu.png' });
  }
});
