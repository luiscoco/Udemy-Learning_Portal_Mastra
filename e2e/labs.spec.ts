import { expect, test } from '@playwright/test';
import { catalog } from '../packages/lab-catalog/src/index';

// Happy path for every released course lab: open the Run tab, run the example input offline,
// and require that the run succeeds with all automated checks passing.
const released = catalog.labs.filter((l) => l.status === 'available' && l.number > 0);

for (const lab of released) {
  test(`${lab.id} ${lab.title}: example input runs and passes its checks`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/labs/${lab.id}?tab=run`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lab.title);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 100_000 });
    await expect(page.getByTestId('timeline')).toContainText('complete — succeeded');
  });
}

test('lab-01 shows the generated project files and build result', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/labs/lab-01?tab=run');
  await page.getByLabel('Module system').selectOption('commonjs');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — some checks failed', { timeout: 100_000 });
  await expect(page.getByTestId('timeline')).toContainText('create src/mastra/index.ts');
  await expect(page.getByTestId('checks')).toContainText('package.json declares "type": "module"');
});
