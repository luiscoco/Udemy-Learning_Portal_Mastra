import { catalog } from '../packages/lab-catalog/src/index';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lab00Definition } from '../packages/labs/src/lab-00/definition';

async function noSeriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const AVAILABLE = catalog.labs.filter((l) => l.status === 'available').length;
const summary = (done: number) => `${done} of ${AVAILABLE} available ${AVAILABLE === 1 ? 'lab' : 'labs'} completed`;

test('Dummy Lab 00 end-to-end: learn, run, cancel, source, quiz, persistent progress', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-00');
  await expect(page.getByTestId('lab-status')).toHaveText('Not started');

  // Learn
  await expect(page.getByRole('heading', { name: 'Concept' })).toBeVisible();
  await page.getByRole('button', { name: 'Show hint 1 of 3' }).click();
  await expect(page.getByText(lab00Definition.guide.hints[0]!.text)).toBeVisible();
  await page.getByRole('button', { name: 'Mark lesson as read' }).click();
  await expect(page.getByText('✓ Lesson marked as read')).toBeVisible();
  await noSeriousViolations(page);

  // Run (real API, offline deterministic lab)
  await page.getByRole('tab', { name: 'Run' }).click();
  await expect(page).toHaveURL(/\?tab=run$/);
  await expect(page.getByText('Mastra runtime is installed')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('token-output')).toContainText('Echo:');
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 15_000 });
  await expect(page.getByTestId('token-output')).toHaveText('Echo: Hello Mastra learners');
  await expect(page.getByTestId('checks').getByText('One token event was streamed per echo word')).toBeVisible();
  await expect(page.getByTestId('timeline')).toContainText('complete — succeeded');
  await noSeriousViolations(page);

  // Cancel a slow run
  await page.getByLabel('Delay per token (ms)').fill('900');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('token-output')).toContainText('Echo:');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run cancelled', { timeout: 10_000 });
  await expect(page.getByRole('alert')).toContainText('CANCELLED');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();

  // Server-side validation path (client lets an out-of-range value through only via the API; here client blocks it)
  await page.getByLabel('Delay per token (ms)').fill('5000');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('Enter a value between 0 and 1000.')).toBeVisible();
  await page.getByLabel('Delay per token (ms)').fill('0');

  // Source
  await page.getByRole('tab', { name: 'Source' }).click();
  await expect(page.getByLabel('Source of run.ts')).toContainText('export const lab00');
  await expect(page.getByLabel('Pinned versions').getByText(/@mastra\/core \d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByLabel('Exercise solution')).toHaveCount(0);
  await noSeriousViolations(page);

  // Quiz: all correct
  for (const [i, q] of lab00Definition.quiz.entries()) {
    await page
      .getByRole('group', { name: new RegExp(`^${i + 1}\\.`) })
      .getByRole('radio', { name: q.choices[q.correctIndex], exact: true })
      .check();
  }
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByTestId('quiz-score')).toHaveText('Score 4/4 — passed');

  await expect(page.getByTestId('lab-status')).toHaveText('Completed');

  // Persistence across reload
  await page.reload();
  await expect(page.getByTestId('lab-status')).toHaveText('Completed');
  await expect(page.getByTestId('progress-summary').first()).toHaveText(summary(1));
});

test('API errors surface in the Run tab (live mode refused on offline server)', async ({ page, request }) => {
  // The UI disables live for offline-only labs; verify the API contract directly as well.
  const res = await request.post('/api/labs/lab-00/runs', { data: { input: { message: 'x' }, mode: 'live' } });
  expect(res.status()).toBe(503);
  await page.goto('/labs/lab-00?tab=run');
  await expect(page.getByRole('radio', { name: /Live/ })).toBeDisabled();
});
