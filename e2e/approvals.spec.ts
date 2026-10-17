import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Interactive human approval: the run pauses on the refund tool and waits for the learner's click.
for (const [choice, expected] of [
  ['Approve', '"refundExecutions": 1'],
  ['Decline', '"refundExecutions": 0'],
] as const) {
  test(`lab-15: learner can ${choice.toLowerCase()} a paused refund from the Run tab`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/labs/lab-15?tab=run');
    await page.getByLabel('Approver’s decision').selectOption('ask');
    await page.getByRole('button', { name: 'Run', exact: true }).click();

    const panel = page.getByTestId('approval-panel');
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('run-status')).toHaveText('Waiting for your approval…');
    await expect(panel).toContainText('Refund €45.00 on ORD-1001');

    const results = await new AxeBuilder({ page })
      .include('[data-testid="approval-panel"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

    await panel.getByRole('button', { name: choice, exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
    await expect(page.getByTestId('timeline')).toContainText(
      `approval ${choice === 'Approve' ? 'approved' : 'declined'} (by you)`,
    );
    await expect(page.getByLabel('Run output')).toContainText(expected);
  });
}
