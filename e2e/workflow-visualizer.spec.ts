import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Workflow visualizer (L68): the DAG appears, nodes follow the real run, and hidden workflows stay hidden.
test('lab-68: live workflow graph with real statuses; a hidden workflow reveals nothing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-68?tab=run');
  await page.locator('input[name="stepDelayMs"]').fill('250');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const graph = page.getByTestId('workflow-graph');
  await expect(graph).toBeVisible({ timeout: 15_000 });
  const node = (id: string) => graph.locator(`[data-testid="workflow-node"][data-node="${id}"]`);
  // While the run streams, some node is running and later ones are still waiting.
  await expect(graph.locator('[data-status="running"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(node('shipping.notifyCustomer')).toHaveAttribute('data-status', 'waiting');

  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  await expect(node('autoApprove')).toHaveAttribute('data-status', 'success');
  await expect(node('managerReview')).toHaveAttribute('data-status', 'skipped');
  await expect(node('shipping.notifyCustomer')).toHaveAttribute('data-status', 'success');
  // The model step: its node succeeded and its drafted email streamed into Live output.
  await expect(node('shipping.emailWriter')).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId('token-output')).toContainText('TRK-5521');
  await expect(page.getByTestId('visible-workflows')).toHaveText('Workflows you can see: Order fulfilment');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="workflow-graph"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // A workflow this role may not see: no graph, nothing about it in the page.
  await page.locator('input[name="workflowId"]').fill('refund-override');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 30_000 });
  await expect(page.getByTestId('workflow-graph')).toHaveCount(0);
  await expect(page.getByText('overrideDecision')).toHaveCount(0);
  await expect(page.getByTestId('visible-workflows')).toHaveText('Workflows you can see: Order fulfilment');
});
