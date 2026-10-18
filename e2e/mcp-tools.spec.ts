import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// MCP tool discovery (L47): the Run tab shows discovered schemas and the result of a permitted call.
test('lab-47: discovered tool schemas and the call result are shown', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-47?tab=run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const catalog = page.getByTestId('mcp-catalog');
  await expect(catalog.getByRole('list', { name: 'Discovered tools' }).getByRole('listitem')).toHaveCount(4);
  const search = catalog.getByRole('article', { name: 'search_labs' });
  await expect(search.getByRole('table', { name: 'Parameters of search_labs' }).getByRole('row')).toHaveCount(3);
  await search.getByText('JSON Schema of search_labs').click();
  await expect(search.locator('pre')).toContainText('"minLength": 2');
  await expect(catalog.getByTestId('mcp-call-result')).toContainText('Discover MCP tools');

  const results = await new AxeBuilder({ page }).include('[data-testid="mcp-catalog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
