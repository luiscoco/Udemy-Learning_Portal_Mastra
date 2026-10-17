import { expect, test } from '@playwright/test';

// Lab 19 DoD: the UI exposes only the options the selected model supports, and the run records them.
test('lab-19 shows only supported options per model and records the effective ones', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-19?tab=run');
  const model = page.getByRole('combobox', { name: /^Model\b/ });

  // gpt-5-mini: no temperature; reasoning effort with exactly its four values (plus provider default).
  await expect(model).toHaveValue('openai/gpt-5-mini');
  await expect(page.getByRole('combobox', { name: /^Temperature/ })).toHaveCount(0);
  const effort = page.getByRole('combobox', { name: /^Reasoning effort/ });
  await expect(effort.locator('option')).toHaveText(['Provider default', 'minimal', 'low', 'medium', 'high']);

  // claude-haiku-4-5: temperature appears, reasoning effort disappears.
  await model.selectOption('anthropic/claude-haiku-4-5');
  await expect(page.getByRole('combobox', { name: /^Reasoning effort/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: /^Temperature/ }).selectOption('0.3');

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 100_000 });
  const output = page.getByLabel('Run output');
  await expect(output).toContainText('"temperature": 0.3');
  await expect(output).toContainText('"option": "reasoningEffort"');
  await expect(page.getByLabel('Effective options')).toContainText('"maxSteps": 4');
});
