import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// MCP capability probe (L48): the matrix separates protocol, server and Mastra adapter, and a fallback is labelled.
test('lab-48: capability matrix and a labelled fallback on the tools-only server', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-48?tab=run');
  await page.getByLabel('Example server').selectOption('tools-only');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const matrix = page.getByTestId('mcp-capabilities');
  const table = matrix.getByRole('table', { name: 'MCP capability matrix' });
  await expect(table.getByRole('row', { name: /^Resources / })).toContainText('Not advertised');
  await expect(table.getByRole('row', { name: /^Completions/ })).toContainText('Not exposed');
  const op = matrix.getByRole('region', { name: 'Operation result' });
  await expect(op).toContainText('Fallback: tool course_info');
  await expect(op).toContainText('does not advertise resources');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="mcp-capabilities"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
