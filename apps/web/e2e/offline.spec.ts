import { expect, test } from '@playwright/test';
import { enter, serverObservations, waitSynced } from './helpers';

/** US-08: go offline, log three entries, restart the app, reconnect — exactly three server rows, no duplicates. */
test('US-08 offline: three entries survive a restart and sync exactly once', async ({ page, context, request }) => {
  await enter(page);
  await waitSynced(page);
  // the service worker must control the page before we cut the network
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByTestId('quick-grid')).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForTimeout(1500); // let the precache message land
  const before = (await serverObservations(request)).length;

  await context.setOffline(true);
  for (const b of [3, 4, 6]) {
    await page.getByTestId('quick-stool').click();
    await page.getByTestId(`tile-bristol-${b}`).click();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByTestId('sync-badge')).toHaveText(/3/);

  // restart the app while still offline
  await page.reload();
  await expect(page.getByTestId('quick-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('unsynced-badge')).toHaveCount(3);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSynced(page);
  const after = await serverObservations(request);
  expect(after.length - before).toBe(3);
  expect(new Set(after.map((o) => o.client_id)).size).toBe(after.length);
});
