import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { lab06Definition } from '../packages/labs/src/lab-06/definition';
import { lab15Definition } from '../packages/labs/src/lab-15/definition';
import { progressAccount, signInProgress } from './progress-helpers';

const progress = async (page: Page, account: string) =>
  (await page.request.get('/api/progress', { headers: { 'x-progress-subject': encodeURIComponent('dev:' + account) } })).json();
async function download(page: Page, label: string, info: TestInfo) {
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const file = await ready;
  const target = resolve('.data/milestone-qa', info.project.name + '-' + file.suggestedFilename());
  await file.saveAs(target);
  return { bytes: await readFile(target), target };
}
test('milestone paths, concept source, recognition and build evidence stay separate from lab progress', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const account = progressAccount(info, 'milestone-study');
  await signInProgress(page, account);
  const before = await progress(page, account);
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Milestone projects', exact: true })).toBeVisible();
  for (const name of ['Study Coach', 'Agent Evaluation Studio', 'Agent Publishing Studio'])
    await expect(page.getByRole('link', { name: 'Open ' + name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open Study Coach', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Study Coach', exact: true })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Build stages and evidence' }).click();
  await page.getByLabel('Node and pinned dependencies checked', { exact: true }).check();
  await page.getByLabel('Project notes', { exact: true }).fill('My own M01 evidence.');
  await page.getByLabel('Project text size').selectOption('125');
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Build stages and evidence' }).click();
  await expect(page.getByLabel('Node and pinned dependencies checked', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Project notes', { exact: true })).toHaveValue('My own M01 evidence.');
  await expect(page.getByLabel('Project text size')).toHaveValue('125');
  await page.getByLabel('Project topic', { exact: true }).selectOption('lab-06');
  await page.getByRole('button', { name: 'Inspect linked source' }).click();
  await expect(page.locator('summary').filter({ hasText: 'lab-06/' }).first()).toBeVisible();
  await page.getByLabel(lab06Definition.quiz[0]!.choices[lab06Definition.quiz[0]!.correctIndex]!, { exact: true }).check();
  await page.getByRole('button', { name: 'Check recognition' }).click();
  await expect(page.getByText('Correct.', { exact: false }).last()).toBeVisible();
  const starter = unzipSync((await download(page, 'Download learner starter', info)).bytes);
  expect(Object.keys(starter).filter((name) => name.startsWith('prompts/'))).toHaveLength(7);
  expect(strFromU8(starter['src/coach.ts']!)).toContain("import('@mastra/core/agent')");
  expect(await progress(page, account)).toEqual(before);
  for (const theme of ['dark', 'light']) {
    const toggle = page.getByRole('button', { name: 'Switch to ' + theme + ' theme' });
    if (await toggle.count()) await toggle.click();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(
      scan.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, nodes: v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: '.data/milestone-qa/' + info.project.name + '-study-' + theme + '.png' });
  }
});
test('evaluation executes real offline cases, reports failures, cancels and handles approval without grading lessons', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const account = progressAccount(info, 'milestone-evaluation');
  await signInProgress(page, account);
  const before = await progress(page, account);
  await page.goto('/projects/evaluation-studio');
  await page.getByLabel('Case input JSON').fill('{bad');
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Reset case input' }).click();
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  await expect(page.getByTestId('evaluation-status')).toContainText('succeeded', { timeout: 30000 });
  await expect(page.getByTestId('timeline')).toContainText('complete');
  await page.getByLabel('Project topic', { exact: true }).selectOption('lab-00');
  await page.getByLabel('Case input JSON').fill(JSON.stringify({ message: 'Failure case', delayMs: 0, simulateFailure: true }));
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  await expect(page.getByTestId('evaluation-status')).toContainText('failed', { timeout: 15000 });
  await page
    .getByLabel('Case input JSON')
    .fill(JSON.stringify({ message: 'One two three four five six seven eight nine ten', delayMs: 1000, simulateFailure: false }));
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  await expect(page.getByTestId('evaluation-status')).toContainText('streaming');
  await page.getByRole('button', { name: 'Cancel evaluation', exact: true }).click();
  await expect(page.getByTestId('evaluation-status')).toContainText('cancelled');
  await page.getByLabel('Project topic', { exact: true }).selectOption('lab-15');
  await page.getByLabel('Case input JSON').fill(JSON.stringify({ ...lab15Definition.exampleInput, userDecision: 'ask' }));
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  await expect(page.getByTestId('approval-panel')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('approval-panel').getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(page.getByTestId('evaluation-status')).toContainText('succeeded', { timeout: 30000 });
  const evidence = JSON.parse((await download(page, 'Export project evidence', info)).bytes.toString());
  expect(evidence.attempts.map((a: { status: string }) => a.status)).toEqual(
    expect.arrayContaining(['succeeded', 'failed', 'cancelled']),
  );
  expect(JSON.stringify(evidence)).not.toMatch(/runToken|cookieValue|mlp_session/);
  expect(await progress(page, account)).toEqual(before);
});
test('publishing exports the selected completed answer in all formats and applies a private PNG style', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await signInProgress(page, progressAccount(info, 'milestone-publishing'));
  await page.goto('/projects/publishing-studio');
  await expect(page.getByRole('button', { name: 'Download DOCX', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ask project coach', exact: true }).click();
  await expect(page.getByTestId('project-answer-status')).toContainText('Complete', { timeout: 30000 });
  const selected = await page.getByTestId('selected-answer-provenance').innerText();
  const id = /Answer ([^ ]+)/.exec(selected)![1]!;
  await page.getByLabel('Your project question').fill('UNSENT DRAFT MUST NOT APPEAR IN EXPORTS');
  await expect(page.getByTestId('project-answer').locator('pre code')).toHaveCount(1);
  const doc = unzipSync((await download(page, 'Download DOCX', info)).bytes);
  expect(strFromU8(doc['word/document.xml']!)).toContain(id);
  expect(strFromU8(doc['word/document.xml']!)).not.toContain('UNSENT DRAFT');
  expect(strFromU8(doc['word/document.xml']!)).toContain('w:color');
  expect((await download(page, 'Download MD', info)).bytes.toString()).toContain(id);
  const pdf = (await download(page, 'Download PDF', info)).bytes;
  expect(pdf.subarray(0, 8).toString()).toContain('%PDF-1.4');
  const svg = (await download(page, 'Download SVG', info)).bytes.toString();
  expect(svg).toContain(id);
  expect(svg).toContain('excerpt');
  expect((await download(page, 'Download PNG', info)).bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await page
    .getByLabel('PNG style reference (local only)')
    .setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not png') });
  await expect(page.getByRole('alert')).toContainText('PNG');
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#087cff';
    ctx.fillRect(0, 0, 320, 180);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page
    .getByLabel('PNG style reference (local only)')
    .setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByRole('button', { name: 'Remove style reference' })).toBeVisible();
  expect((await download(page, 'Download SVG', info)).bytes.toString()).toContain('<image href="data:image/png;base64,');
  await download(page, 'Download PNG', info);
  await page.getByRole('heading', { name: 'Publish a selected answer' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.data/milestone-qa/' + info.project.name + '-publishing.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
test('live answers require fresh consent, interrupted streams stay unpublished and accounts isolate answers', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signInProgress(page, progressAccount(info, 'milestone-live'));
  await page.route('**/api/tutor/settings', (route) =>
    route.fulfill({
      json: {
        liveEnabled: true,
        models: [{ id: 'openai/gpt-4o-mini', provider: 'openai', configured: true }],
        questionLimit: 2000,
        answerLimit: 16000,
        timeoutMs: 60000,
      },
    }),
  );
  let requests = 0;
  await page.route('**/api/tutor/answer', async (route) => {
    const input = route.request().postDataJSON(),
      seq = ++requests;
    const answer =
      '## Completed response ' +
      seq +
      '\n\nReviewed Mastra guidance.\n\n' +
      String.fromCharCode(96).repeat(3) +
      'ts\nconst selected = ' +
      seq +
      ';\n' +
      String.fromCharCode(96).repeat(3);
    const events = [
      {
        type: 'started',
        seq: 0,
        requestId: 'a' + seq,
        labId: input.labId,
        mode: 'live',
        simulated: false,
        modelId: input.modelId,
      },
      { type: 'text', seq: 1, requestId: 'a' + seq, text: seq === 1 ? 'Partial only' : answer },
      ...(seq === 1 ? [] : [{ type: 'complete', seq: 2, requestId: 'a' + seq, text: answer }]),
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      body: events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
    });
  });
  await page.goto('/projects/publishing-studio');
  await page.getByLabel('Answer mode').selectOption('live');
  await expect(page.getByRole('button', { name: 'Ask project coach' })).toBeDisabled();
  await page.getByLabel('Authorize this paid answer').check();
  await page.getByRole('button', { name: 'Ask project coach' }).click();
  await expect(page.getByTestId('project-answer-status')).toContainText('Failed - incomplete');
  await expect(page.getByRole('button', { name: 'Download DOCX', exact: true })).toBeDisabled();
  expect(requests).toBe(1);
  await page.getByLabel('Authorize this paid answer').check();
  await page.getByRole('button', { name: 'Ask project coach' }).click();
  await expect(page.getByTestId('selected-answer-provenance')).toContainText('Live: openai/gpt-4o-mini');
  await expect(page.getByLabel('Authorize this paid answer')).not.toBeChecked();
  await page.reload();
  await expect(page.getByTestId('selected-answer-provenance')).toBeVisible();
  await signInProgress(page, progressAccount(info, 'milestone-study'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Download DOCX', exact: true })).toBeDisabled();
  await expect(page.getByTestId('selected-answer-provenance')).toHaveCount(0);
});
