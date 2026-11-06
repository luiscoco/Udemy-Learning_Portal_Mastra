import { expect, test } from '@playwright/test';

test('production pages preserve saved theme and course views under the content security policy', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { courseCspViolations: string[] };
    state.courseCspViolations = [];
    window.addEventListener('securitypolicyviolation', (e) => state.courseCspViolations.push(e.violatedDirective));
    localStorage.setItem('mlp.theme', 'dark');
  });
  for (const path of ['/', '/labs/lab-32?tab=learn', '/labs/lab-68?tab=run', '/labs/lab-69?tab=run', '/labs/lab-00?tab=source']) {
    const response = await page.goto(path);
    expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => (window as typeof window & { courseCspViolations: string[] }).courseCspViolations)).toEqual(
      [],
    );
  }
});
