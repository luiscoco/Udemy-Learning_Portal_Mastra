import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function runWith(page: Page, opts: { store?: string; action?: string; configId?: string }) {
  if (opts.store) await page.locator('select[name="store"]').selectOption(opts.store);
  if (opts.action) await page.locator('select[name="action"]').selectOption(opts.action);
  if (opts.configId) await page.locator('select[name="configId"]').selectOption(opts.configId);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 120_000 });
}

// Quality dashboard (L60): a usable empty state, then regressions with stored trace links.
test('lab-60: empty state first, then a regression whose stored trace opens', async ({ page }, testInfo) => {
  // This spec appends runs to the shared course store and asserts on the last two. Running it in both
  // projects at once interleaves their runs, so it runs in one project only (the mobile layout of the
  // dashboard is covered by the lab-60 example in labs.spec.ts, which only records grounded runs).
  test.skip(testInfo.project.name !== 'desktop', 'writes shared run history; desktop project only');
  test.setTimeout(240_000);
  await page.goto('/labs/lab-60?tab=run');
  await runWith(page, { store: 'empty-demo', action: 'show-only' });
  const board = page.getByTestId('quality-dashboard');
  await expect(board.getByRole('status')).toContainText('No quality data yet');
  await expect(board.getByRole('list', { name: 'Next steps' })).toContainText('Record a run');

  await page.goto('/labs/lab-60?tab=run');
  await runWith(page, { configId: 'grounded' });
  await page.goto('/labs/lab-60?tab=run');
  await runWith(page, { configId: 'no-tools' });
  await expect(board.getByRole('region', { name: 'Key indicators' })).toContainText('Change vs previous run−0.5');
  const regressed = board.getByRole('list', { name: 'Regressed scenarios' });
  await expect(regressed).toContainText('Workflow steps');
  await regressed.getByRole('button', { name: 'Open trace of Workflow steps' }).click();
  await expect(page.getByTestId('span-tree')).toContainText("agent run: 'cfg-no-tools'");

  const results = await new AxeBuilder({ page })
    .include('[data-testid="quality-dashboard"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
