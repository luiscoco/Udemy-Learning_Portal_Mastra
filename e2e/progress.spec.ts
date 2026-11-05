import { expect, test, devices, type Browser, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyProgress } from '../packages/contracts/src/progress';
import { lab00Definition } from '../packages/labs/src/lab-00/definition';
import { progressKey, storageScopeOf } from '../apps/web/src/lib/storage-scope';
import { progressAccount, progressSaved, signInProgress } from './progress-helpers';

async function freshPage(browser: Browser, info: TestInfo, username: string) {
  const context = await browser.newContext({
    ...(info.project.name === 'mobile' ? devices['Pixel 7'] : devices['Desktop Chrome']),
    baseURL: info.project.use.baseURL as string,
  });
  const page = await context.newPage();
  await signInProgress(page, username);
  return { context, page };
}
const subject = (username: string) => ({ 'x-progress-subject': encodeURIComponent(`dev:${username}`) });
async function saveFromOtherDevice(page: Page, username: string, notes: string) {
  const headers = subject(username);
  const snapshot = await (await page.request.get('/api/progress', { headers })).json();
  const entry = snapshot.entries.find((e: { labId: string }) => e.labId === 'lab-00');
  const response = await page.request.post('/api/progress/lab-00', {
    headers,
    data: { baseRevision: entry?.revision ?? 0, record: { ...(entry?.record ?? emptyProgress('lab-00')), notes } },
  });
  expect(response.status()).toBe(200);
}

test('account progress, notes, prediction, quiz and completion restore in a fresh browser', async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const username = progressAccount(info, 'cross');
  await signInProgress(page, username);
  await page.goto('/labs/lab-00?tab=run');
  await progressSaved(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 20000 });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await page.getByRole('button', { name: 'Mark lesson as read' }).click();
  await page.getByLabel('Your prediction', { exact: true }).fill('The workflow will stream an echo.');
  await page.getByLabel('Notes for lab-00', { exact: true }).fill('My account note from device one.');
  await page
    .getByRole('checkbox', { name: /^I can:/ })
    .first()
    .check();
  for (const [i, q] of lab00Definition.quiz.entries())
    await page
      .getByRole('group', { name: new RegExp(`^${i + 1}\\.`) })
      .getByRole('radio', { name: q.choices[q.correctIndex], exact: true })
      .check();
  await page.getByRole('button', { name: 'Submit answers', exact: true }).click();
  await expect(page.getByTestId('lab-status')).toHaveText('Completed');
  await progressSaved(page);
  const second = await freshPage(browser, info, username);
  try {
    await second.page.goto('/labs/lab-00');
    await progressSaved(second.page);
    await expect(second.page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('My account note from device one.');
    await expect(second.page.getByLabel('Your prediction', { exact: true })).toHaveValue('The workflow will stream an echo.');
    await expect(second.page.getByTestId('quiz-score')).toHaveText('Score 4/4 — passed');
    await expect(second.page.getByTestId('lab-status')).toHaveText('Completed');
    await expect(second.page.getByRole('checkbox', { name: /^I can:/ }).first()).toBeChecked();
    expect(await second.page.evaluate(() => localStorage.getItem('mlp.progress.v1'))).toBeNull();
  } finally {
    await second.context.close();
  }
});

test('queued edits survive a progress-service outage and reload, then sync on retry', async ({ page }, info) => {
  const username = progressAccount(info, 'offline');
  await signInProgress(page, username);
  await page.goto('/labs/lab-00');
  await progressSaved(page);
  await page.route('**/api/progress**', (route) => route.abort('failed'));
  await page.getByLabel('Notes for lab-00', { exact: true }).fill('Offline draft that must survive reload.');
  await expect(page.getByRole('button', { name: 'Retry progress sync' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('Offline draft that must survive reload.');
  await expect(page.getByRole('button', { name: 'Retry progress sync' })).toBeVisible();
  await page.unroute('**/api/progress**');
  await page.getByRole('button', { name: 'Retry progress sync' }).click();
  await progressSaved(page);
  await page.reload();
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('Offline draft that must survive reload.');
});

test('conflicting notes stay local until the learner explicitly chooses a version', async ({ page }, info) => {
  const username = progressAccount(info, 'conflict');
  await signInProgress(page, username);
  await page.goto('/labs/lab-00');
  await progressSaved(page);
  await saveFromOtherDevice(page, username, 'Saved by another device');
  await page.getByLabel('Notes for lab-00', { exact: true }).fill('My conflicting draft');
  await expect(page.getByTestId('progress-sync')).toContainText('Progress changed on another device');
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('My conflicting draft');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.getByRole('button', { name: 'Use saved progress', exact: true }).click();
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('Saved by another device');
  await saveFromOtherDevice(page, username, 'Another external update');
  await page.getByLabel('Notes for lab-00', { exact: true }).fill('Explicitly keep my device draft');
  await expect(page.getByRole('button', { name: 'Keep this device’s changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep this device’s changes', exact: true }).click();
  await progressSaved(page);
  await page.reload();
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('Explicitly keep my device draft');
});

test('legacy migration is backed up and a reset cannot be undone by old browser data', async ({ page }, info) => {
  const username = progressAccount(info, 'migration');
  const key = progressKey(storageScopeOf({ sub: `dev:${username}` }));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key,
    value: JSON.stringify({ version: 1, records: { 'lab-00': { ...emptyProgress('lab-00'), notes: 'Legacy browser note' } } }),
  });
  await signInProgress(page, username);
  await page.goto('/labs/lab-00');
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('Legacy browser note');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download device backup' }).click();
  expect((await downloaded).suggestedFilename()).toBe('learner-progress-device-backup.json');
  await page.getByRole('button', { name: 'Reset this lab’s progress', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reset', exact: true }).click();
  await progressSaved(page);
  await page.reload();
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('lab-status')).toHaveText('Not started');
});

test('switching accounts never exposes or submits another learner’s progress', async ({ page }, info) => {
  const alice = progressAccount(info, 'alice');
  const bob = progressAccount(info, 'bob');
  await signInProgress(page, alice);
  await page.goto('/labs/lab-00');
  await progressSaved(page);
  await page.getByLabel('Notes for lab-00', { exact: true }).fill('Alice private account note');
  await progressSaved(page);
  await signInProgress(page, bob);
  await page.goto('/labs/lab-00');
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('');
  expect((await page.request.get('/api/progress', { headers: subject(alice) })).status()).toBe(404);
  await page.getByLabel('Notes for lab-00', { exact: true }).fill('Bob private account note');
  await progressSaved(page);
  await signInProgress(page, alice);
  await page.goto('/labs/lab-00');
  await progressSaved(page);
  await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('Alice private account note');
});
