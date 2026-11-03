import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Voice assistant (L69): a spoken reply to play, an honest text fallback, and a recorder that explains itself first.
test('lab-69: sample clip answered and spoken; speech-to-text down falls back to typing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/labs/lab-69?tab=run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  const turn = page.getByTestId('voice-turn');
  await expect(turn).toContainText('Heard: “Where is my order ORD-5001?”');
  await expect(page.getByTestId('voice-answer')).toContainText('ORD-5001 (Ceramic mug) is shipped');
  await expect(page.getByLabel('Spoken reply')).toHaveAttribute('src', /^data:audio\/wav;base64,/);
  const results = await new AxeBuilder({ page }).include('[data-testid="voice-turn"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // Speech-to-text down and nothing typed: the assistant asks to type instead of guessing.
  await page.locator('select[name="fault"]').selectOption('stt-down');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  await expect(page.getByTestId('voice-needs-text')).toBeVisible();

  // Typing works without any audio service.
  await page.locator('textarea[name="message"]').fill('Where is ORD-5002?');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 60_000 });
  await expect(page.getByTestId('voice-answer')).toContainText('ORD-5002 (Espresso machine) is packing');
  await expect(page.getByTestId('voice-turn')).toContainText('text fallback');

  // Upload or record: the notice comes first, nothing is recorded without a click.
  await page.locator('select[name="audioSource"]').selectOption('upload');
  await expect(page.getByTestId('mic-recorder').or(page.getByTestId('recorder-unsupported'))).toBeVisible();
  await expect(page.getByText(/Your browser will ask for microphone access|Recording is not supported/)).toBeVisible();
});
