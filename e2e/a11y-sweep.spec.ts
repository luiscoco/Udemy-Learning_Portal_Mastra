import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { catalog } from '../packages/lab-catalog/src/index';

// L74 accessibility gate: axe (WCAG 2.1 A/AA) on every available lab's Learn and Run tabs. Runs only with
// A11Y_SWEEP=1 (npm run regression); each test writes its page results for the gate to aggregate.
const OUT = join('test-results', 'a11y-sweep');
const labs = catalog.labs.filter((l) => l.status === 'available');

test.describe.configure({ mode: 'parallel' });

for (const lab of labs) {
  test(`a11y sweep ${lab.id}`, async ({ page }, testInfo) => {
    test.skip(process.env.A11Y_SWEEP !== '1', 'set A11Y_SWEEP=1 (npm run regression) to run the accessibility sweep');
    test.skip(testInfo.project.name !== 'desktop', 'the sweep runs once, on desktop');
    test.setTimeout(90_000);
    const pages: { url: string; violations: { id: string; impact: string | null; nodes: number }[] }[] = [];
    for (const tab of ['learn', 'run'] as const) {
      const url = `/labs/${lab.id}?tab=${tab}`;
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(lab.title);
      await expect(page.getByRole('tab', { name: tab === 'learn' ? 'Learn' : 'Run' })).toHaveAttribute('aria-selected', 'true');
      // Let first renders, history loads and lazy panels settle before scanning.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      pages.push({ url, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length })) });
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${lab.id}.json`), JSON.stringify(pages));
  });
}
