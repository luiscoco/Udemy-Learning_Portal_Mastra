import { expect, type Page, type TestInfo } from '@playwright/test';

export function progressAccount(info: TestInfo, kind: string): string {
  return (info.config.metadata.progressAccounts as Record<string, Record<string, string>>)[info.project.name]![kind]!;
}
export async function signInProgress(page: Page, username: string) {
  // Do not revoke the shared setup session when a progress test needs its own learner.
  await page.context().clearCookies();
  const login = await page.request.post('/api/auth/login', { data: { username } });
  expect(login.status()).toBe(200);
}
export async function progressSaved(page: Page) {
  await expect(page.getByTestId('progress-sync')).toContainText('Progress saved to your account.', { timeout: 15000 });
}
