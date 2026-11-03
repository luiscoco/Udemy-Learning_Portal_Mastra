import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// File uploads (L36): the browser reads the files, the server validates and extracts them.
test('lab-36: a learner uploads files; a valid one is ingested and a disguised one is rejected', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-36?tab=run');
  await page.getByLabel('Built-in fixtures').selectOption('none');
  await page.getByLabel('Store ingested documents in the course library').uncheck();
  await page.getByLabel('Your files (optional)').setInputFiles([
    {
      name: 'team-notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Team notes\n\nPriority tickets are answered within four hours.\n'),
    },
    { name: 'holiday.txt', mimeType: 'text/plain', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ]);
  const list = page.getByRole('list', { name: 'Selected files for Your files (optional)' });
  await expect(list).toContainText('team-notes.md');
  await expect(list).toContainText('holiday.txt');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 100_000 });
  await expect(page.getByTestId('timeline')).toContainText('team-notes.md: ingested (text/markdown');
  await expect(page.getByTestId('timeline')).toContainText('holiday.txt: rejected EXECUTABLE_CONTENT');

  await list.getByRole('button', { name: 'Remove holiday.txt' }).click();
  await expect(list).not.toContainText('holiday.txt');
});
