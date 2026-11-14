import { expect, test } from '@playwright/test';
import { enter, serverObservations, serverToken, waitSynced } from './helpers';

/** A real 64×48 PNG, so the on-device shrink path (decode → canvas) actually runs. */
async function png(page: import('@playwright/test').Page, colour: string): Promise<Buffer> {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = c; ctx.fillRect(0, 0, 64, 48);
    return cv.toDataURL('image/png').split(',')[1]!;
  }, colour);
  return Buffer.from(b64, 'base64');
}

test('08 §4.4: meal photos can be picked from the gallery, several at once, up to the limit', async ({ page, request }) => {
  await enter(page);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('sheet-meal');
  await page.getByTestId('meal-text').fill('חומוס עם פיתה ותמונה');
  await expect(sheet.getByTestId('parsed-items').locator('li').first()).toBeVisible({ timeout: 10_000 }); // a real food, so no clarify step

  await sheet.getByTestId('meal-photo').click();
  await expect(page.getByTestId('photo-source')).toBeVisible();
  await expect(page.getByTestId('photo-gallery')).toBeVisible();
  await expect(page.getByTestId('photo-camera')).toBeVisible();
  // the gallery input must not force the camera, and must allow several files
  const gallery = page.getByTestId('photo-gallery-input');
  await expect(gallery).not.toHaveAttribute('capture');
  await expect(gallery).toHaveAttribute('multiple');

  const files = await Promise.all(['#c33', '#3c3', '#33c', '#cc3', '#3cc'].map(async (c, i) => ({ name: `meal-${i}.png`, mimeType: 'image/png', buffer: await png(page, c) })));
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('photo-gallery').click();
  await (await chooser).setFiles(files);

  await expect(page.getByTestId('photo-source')).toHaveCount(0);
  await expect(sheet.getByTestId('meal-photos').locator('img')).toHaveCount(4); // the field's max_items
  await expect(page.getByText(/Up to 4 photos|עד 4 תמונות/)).toBeVisible(); // the 5th is reported, not silently lost

  await sheet.getByTestId('save').click();
  await waitSynced(page);

  let photos: string[] = [];
  await expect.poll(async () => {
    const m = (await serverObservations(request, 'meal')).find((o) => String(o.values.description).includes('ותמונה'));
    photos = (m?.values.photos as string[] | undefined) ?? [];
    return photos.length;
  }, { timeout: 20_000 }).toBe(4);
  expect(photos.some((p) => p.startsWith('local_'))).toBe(false); // placeholders never reach the server

  const token = await serverToken(request);
  const r = await request.get(`/api/v1/media/${photos[0]}`, { headers: { authorization: `Bearer ${token}` } });
  expect(r.ok()).toBeTruthy();
  expect(r.headers()['content-type']).toMatch(/^image\//);
});
