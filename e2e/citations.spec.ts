import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Citation-aware answers (L44): every citation opens its source with the quoted sentence highlighted.
test('lab-44: a learner opens a cited source passage and closes it with Escape', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-44?tab=run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 100_000 });

  const answer = page.getByTestId('cited-answer');
  await expect(answer.getByRole('list', { name: 'Answer claims' }).getByRole('listitem')).toHaveCount(2);
  const cite = answer.getByRole('button', { name: /^Open source 1:/ });
  await cite.click();

  const dialog = page.getByRole('dialog', { name: /^Source 1:/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('mark')).toHaveText('Error E-4012: the card payment was declined by the bank.');
  const results = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(cite).toBeFocused();
});
