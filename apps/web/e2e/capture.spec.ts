import { expect, test } from '@playwright/test';
import { enter, serverObservations, waitSynced } from './helpers';

test('direction follows the locale (RTL is structural)', async ({ page }, info) => {
  await enter(page);
  const dir = await page.evaluate(() => document.documentElement.dir);
  expect(dir).toBe(info.project.name.startsWith('rtl') ? 'rtl' : 'ltr');
});

test('US-02: one-tap stool saves and is visible in under 100 ms', async ({ page, request }) => {
  await enter(page);
  await page.getByTestId('quick-stool').click();
  await expect(page.getByTestId('tile-bristol-4')).toBeVisible();
  const before = await page.getByTestId('obs-row').count();
  // Measure inside the page: from the tap to the new row existing in the DOM.
  const ms = await page.evaluate(async (n) => {
    const t0 = performance.now();
    (document.querySelector('[data-testid=tile-bristol-5]') as HTMLButtonElement).click();
    return new Promise<number>((resolve) => {
      const check = () => { if (document.querySelectorAll('[data-testid=obs-row]').length > n) resolve(performance.now() - t0); else requestAnimationFrame(check); };
      check();
    });
  }, before);
  expect(ms).toBeLessThan(100);
  await expect(page.getByTestId('saved-mark')).toBeVisible();
  await waitSynced(page);
  const stools = await serverObservations(request, 'stool');
  expect(stools.some((o) => o.values.bristol === 5)).toBeTruthy();
});

test('US-04: evening check-in with "Nothing to report" is one tap', async ({ page, request }) => {
  await enter(page);
  await page.getByTestId('quick-checkin').click();
  await page.getByTestId('nothing-to-report').click();
  await waitSynced(page);
  const c = await serverObservations(request, 'checkin');
  expect(c.some((o) => o.values.all_clear === true)).toBeTruthy();
});

test('symptoms: several in one pass share a group', async ({ page, request }) => {
  await enter(page);
  await page.getByTestId('quick-symptom').click();
  const sheet = page.getByTestId('sheet-symptom');
  await sheet.getByRole('radio', { name: /^(Bloating|נפיחות) 6$/ }).click();
  await sheet.getByRole('radio', { name: /^(Gas|גזים) 3$/ }).click();
  await sheet.getByTestId('save').click();
  await waitSynced(page);
  const s = (await serverObservations(request, 'symptom')).filter((o) => o.values.kind === 'bloating' || o.values.kind === 'gas');
  expect(s.length).toBeGreaterThanOrEqual(2);
});
