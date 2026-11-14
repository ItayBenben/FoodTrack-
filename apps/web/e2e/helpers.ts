import { expect, type Page, type APIRequestContext } from '@playwright/test';

export const PASS = 'e2e passphrase that is long';

/** Onboard on a fresh instance, unlock on a set-up one. Ends on Today. */
export async function enter(page: Page) {
  await page.goto('/today');
  const step = page.locator('[data-testid^=onboarding-step-]');
  const unlock = page.getByTestId('unlock');
  await expect(step.or(unlock).or(page.getByTestId('quick-grid'))).toBeVisible({ timeout: 20_000 });
  if (await step.isVisible()) {
    for (let i = 0; i < 6; i++) await page.getByTestId('onboarding-continue').click();
    await page.getByTestId('new-passphrase').fill(PASS);
    await page.getByTestId('confirm-passphrase').fill(PASS);
    await page.getByTestId('set-passphrase').click();
  } else if (await unlock.isVisible()) {
    await page.getByTestId('passphrase').fill(PASS);
    await unlock.click();
  }
  await expect(page.getByTestId('quick-grid')).toBeVisible({ timeout: 20_000 });
}

let cached: { token: string; at: number } | null = null;
export async function serverToken(request: APIRequestContext): Promise<string> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.token;
  const r = await request.post('/api/v1/auth/unlock', { data: { passphrase: PASS } });
  expect(r.ok()).toBeTruthy();
  cached = { token: (await r.json()).access_token, at: Date.now() };
  return cached.token;
}

export async function serverObservations(request: APIRequestContext, tracker?: string) {
  const token = await serverToken(request);
  const r = await request.get(`/api/v1/observations?limit=500${tracker ? `&tracker_key=${tracker}` : ''}`, { headers: { authorization: `Bearer ${token}` } });
  return (await r.json()).data as { id: string; client_id: string; tracker_key: string; values: Record<string, unknown> }[];
}

/** Every row on screen has reached the server, and the outbox is empty. */
export async function waitSynced(page: Page) {
  await page.waitForTimeout(300); // let the live query render the just-saved row
  await expect(page.getByTestId('unsynced-badge')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('sync-badge')).toHaveText(/synced|מסונכרן/, { timeout: 20_000 });
}
