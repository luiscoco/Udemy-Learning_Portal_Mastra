import { catalog } from '../packages/lab-catalog/src/index';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

/** Opens the course navigation: drawer on mobile, sidebar on desktop. */
async function courseNav(page: Page) {
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'Open course menu' }).click();
    return page.getByRole('dialog', { name: 'Course menu' }).getByRole('navigation', { name: 'Course' });
  }
  return page.getByRole('complementary', { name: 'Course navigation' }).getByRole('navigation', { name: 'Course' });
}

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

const AVAILABLE = catalog.labs.filter((l) => l.status === 'available').length;
const summary = (done: number) => `${done} of ${AVAILABLE} available ${AVAILABLE === 1 ? 'lab' : 'labs'} completed`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-init', '1');
    }
  });
});

test('sidebar lists 16 modules, navigates to Dummy Lab 00 and marks it current', async ({ page }) => {
  await page.goto('/');
  const nav = await courseNav(page);
  await expect(nav.locator('button[aria-expanded]')).toHaveCount(16);
  await nav.getByRole('link', { name: /lab-00: Dummy Lab 00/ }).click();
  await expect(page).toHaveURL(/\/labs\/lab-00$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dummy Lab 00');
  await expect(page.getByRole('heading', { name: 'Learning objectives' })).toBeVisible();
  const navAfter = await courseNav(page);
  await expect(navAfter.getByRole('link', { name: /lab-00: Dummy Lab 00/ })).toHaveAttribute('aria-current', 'page');
});

test('deep links and the legacy ?lesson= query both open the lesson', async ({ page }) => {
  await page.goto('/labs/lab-00');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dummy Lab 00');
  await page.goto('/?lesson=lab-00');
  await expect(page).toHaveURL(/\/labs\/lab-00$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dummy Lab 00');
});

test('locked labs show a preview without progress or run controls', async ({ page }) => {
  const locked = catalog.labs.find((l) => l.status === 'locked' && l.titleConfirmed)!;
  await page.goto(`/labs/${locked.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(locked.title);
  await expect(page.getByText('This lab is not available yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Run/ })).toHaveCount(0);
});

test('unknown labs and paths show a graceful 404', async ({ page }) => {
  await page.goto('/labs/lab-98');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('couldn’t find that lab');
  await page.goto('/does/not/exist');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('couldn’t find that page');
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('fresh learner sees zero completion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('progress-summary').first()).toHaveText(summary(0));
});

test('keyboard: skip link, "/" search and Enter navigation', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await page.keyboard.press('/');
  const search = page.getByRole('combobox', { name: 'Search labs' });
  await expect(search).toBeFocused();
  await page.keyboard.type('streaming');
  await expect(page.getByRole('option', { name: /lab-08 Token streaming/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/labs\/lab-08$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('keyboard: arrow keys move through sidebar items and Enter toggles modules', async ({ page }) => {
  test.skip(isMobile(page), 'desktop sidebar');
  await page.goto('/');
  const nav = await courseNav(page);
  await nav.getByRole('link', { name: 'Home' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(nav.getByRole('button', { name: /Platform Orientation/ })).toBeFocused();
  const tools = nav.getByRole('button', { name: /Tools and Function Calling/ });
  await tools.focus();
  await expect(tools).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
});

test('theme toggle persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('mobile menu opens as a dialog, closes with Escape and restores focus', async ({ page }) => {
  test.skip(!isMobile(page), 'mobile only');
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Open course menu' });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Course menu' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  // Navigating from the drawer closes it.
  await button.click();
  await dialog.getByRole('link', { name: /lab-00: Dummy Lab 00/ }).click();
  await expect(page).toHaveURL(/\/labs\/lab-00$/);
  await expect(dialog).toHaveCount(0);
});

for (const path of ['/', '/labs/lab-00', '/labs/lab-12', '/missing']) {
  test(`no serious accessibility violations on ${path} (light and dark)`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoSeriousA11yViolations(page);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await expectNoSeriousA11yViolations(page);
  });
}
