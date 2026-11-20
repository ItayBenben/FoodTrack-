import { expect, test, type Page, type Route } from '@playwright/test';
import { enter, waitSynced } from './helpers';

/**
 * 08 §4.4: from the moment a photo is picked until its foods are on screen, the person sees where each
 * photo is (preparing → uploading % → reading → foods found) and which foods came from which photo.
 * e2e runs the offline deterministic provider, so the photo is really uploaded and stored by the API and
 * only the model's answer is stood in for here, slowed to the 8–9 s the real model takes in production.
 */
async function png(page: Page, colour: string): Promise<Buffer> {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = c; ctx.fillRect(0, 0, 64, 48);
    return cv.toDataURL('image/png').split(',')[1]!;
  }, colour);
  return Buffer.from(b64, 'base64');
}
const item = (raw: string, canonical: string) => ({ raw_text: raw, food_id: null, canonical_name: canonical, quantity: null, unit: null, grams_est: null, confidence: 0.8, resolved_by: 'vision', portion_precision: 'unspecified' });
const SEEN = [[item('hummus', 'hummus'), item('pita', 'pita bread')], [item('green salad', 'green salad')]];

/** Real upload to the API; the reply is swapped for what a vision model would say about photo n, after `delayMs`. */
async function fakeVision(page: Page, delayMs: number) {
  let n = 0;
  await page.route('**/api/v1/meals/parse-photo', async (route: Route) => {
    const which = n++;
    const res = await route.fetch();
    const body = await res.json() as { media_id: string };
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ response: res, json: { media_id: body.media_id, vision: 'on', items: SEEN[which % SEEN.length] } });
  });
}
async function pickPhotos(page: Page, colours: string[]) {
  const files = await Promise.all(colours.map(async (c, i) => ({ name: `meal-${i}.png`, mimeType: 'image/png', buffer: await png(page, c) })));
  await page.getByTestId('sheet-meal').getByTestId('meal-photo').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('photo-gallery').click();
  await (await chooser).setFiles(files);
}

test('photo progress: each photo shows its stage, then the foods found in it', async ({ page }, info) => {
  await enter(page);
  await fakeVision(page, 7_000);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('sheet-meal');
  await pickPhotos(page, ['#c33', '#3c3']);

  const rows = sheet.getByTestId('meal-photo-row');
  await expect(rows).toHaveCount(2);
  await expect(sheet.getByTestId('photo-progress').getByRole('progressbar')).toBeVisible();
  // Playwright's interception hides upload progress from the page, so here the photo shows the combined
  // "uploading and reading" stage; a real upload reports progress and then "reading" (checked by hand).
  await expect(sheet.locator('[data-stage=working], [data-stage=reading]').first()).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByTestId('photo-stage').first()).toHaveText(/10–20/);
  await expect(sheet.getByTestId('photo-status')).toHaveText(/Photo \d of 2|תמונה \d מתוך 2/);
  await expect(sheet.getByTestId('save-while-reading')).toBeVisible();
  await page.screenshot({ path: `test-results/photo-progress-reading-${info.project.name}.png` });

  // each photo lists what was seen in it
  await expect(rows.nth(0).getByTestId('photo-foods')).toHaveText(/hummus.*pita/, { timeout: 20_000 });
  await expect(rows.nth(1).getByTestId('photo-foods')).toHaveText(/green salad/, { timeout: 20_000 });
  await expect(rows.nth(0).getByTestId('photo-stage')).toHaveText(/2/);
  await expect(sheet.getByTestId('photo-progress')).toHaveCount(0);
  await expect(sheet.getByTestId('photo-status')).toHaveText(/2 photos read, 3 foods|נקראו 2 תמונות, זוהו 3 מאכלים/);
  await expect(sheet.getByTestId('save-while-reading')).toHaveCount(0);
  await expect(sheet.getByTestId('parsed-items').locator('li')).toHaveCount(3);
  await page.screenshot({ path: `test-results/photo-progress-done-${info.project.name}.png` });

  await sheet.getByTestId('save').click();
  await waitSynced(page);
  await expect(page.getByTestId('obs-row').filter({ hasText: 'green salad' }).first()).toBeVisible();
});

test('saving while photos are still being read says so in the list, never "no details"', async ({ page }) => {
  await enter(page);
  await fakeVision(page, 15_000);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('sheet-meal');
  await pickPhotos(page, ['#33c']);
  await expect(sheet.locator('[data-stage=reading], [data-stage=uploading]').first()).toBeVisible({ timeout: 10_000 });
  await sheet.getByTestId('save').click();
  await expect(page.getByTestId('sheet-meal')).toHaveCount(0);
  const row = page.getByTestId('obs-row').filter({ hasText: /reading the photos|קורא את התמונות/ });
  await expect(row.first()).toBeVisible();
  await expect(page.getByTestId('obs-row').filter({ hasText: /no details|ללא פרטים/ })).toHaveCount(0);
});
