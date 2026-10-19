import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Trace events (L56): Mastra's spans are shown as a tree with the run's correlation id.
test('lab-56: the span tree nests agents under their steps and attributes the tool error', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-56?tab=run');
  await page.getByLabel('Fault').selectOption('tool-error');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const tree = page.getByTestId('span-tree');
  const spans = tree.getByRole('list', { name: 'Trace spans' });
  await expect(spans.getByRole('list', { name: "Children of workflow step: 'research'" })).toContainText(
    "agent run: 'researcher'",
  );
  await expect(spans.getByRole('list', { name: "Children of workflow step: 'answer'" })).toContainText("agent run: 'writer'");
  await expect(tree).toContainText('search backend unavailable (simulated 503)');
  await expect(tree).not.toContainText('at execute');

  const results = await new AxeBuilder({ page }).include('[data-testid="span-tree"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
