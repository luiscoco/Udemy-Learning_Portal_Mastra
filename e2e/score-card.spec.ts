import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Custom scorer (L57): the score card exposes criteria, evidence, the formula and the golden fixtures.
test('lab-57: a learner answer is scored with its rationale and the scorer fixtures pass', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-57?tab=run');
  await page
    .getByLabel('Answer text')
    .fill(
      'A Mastra workflow runs its steps in a fixed order. Each step declares an input schema and an output schema. I had pasta for lunch.',
    );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });

  const card = page.getByTestId('score-card');
  await expect(card.getByTestId('score-formula')).toHaveText('clamp(0.6 × 0.6667 + 0.4 × 0.6667 − 0 − 0, 0, 1) = 0.6667');
  await expect(card).toContainText('Fail');
  await expect(card.getByRole('list', { name: 'Missing for Sentences on topic' })).toContainText('I had pasta for lunch.');
  await expect(card).toContainText('Golden scorer fixtures: 12/12 pass');

  const results = await new AxeBuilder({ page }).include('[data-testid="score-card"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
