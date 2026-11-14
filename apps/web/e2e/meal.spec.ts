import { expect, test } from '@playwright/test';
import { enter, serverObservations, waitSynced } from './helpers';

test('US-01: Hebrew meal text parses into Hebrew items and saves with them', async ({ page, request }) => {
  await enter(page);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('sheet-meal');
  await expect(page.getByTestId('meal-text')).toBeFocused(); // AC1: focused, no extra tap
  await page.getByTestId('meal-text').fill('פיתה עם חומוס, סלט ירקות');
  await expect(sheet.getByTestId('parsed-items').locator('li')).toHaveCount(3, { timeout: 10_000 }); // AC2 + AC3
  await expect(sheet.getByTestId('parsed-items')).toContainText('חומוס'); // AC7: Hebrew in, Hebrew out
  await sheet.getByTestId('save').click();
  await waitSynced(page);
  const meals = await serverObservations(request, 'meal');
  const m = meals.find((o) => String(o.values.description).includes('פיתה'));
  expect(m).toBeTruthy();
});

test('US-01 AC5: offline, a meal still saves and parses on reconnect', async ({ page, context, request }) => {
  await enter(page);
  await waitSynced(page);
  await context.setOffline(true);
  await page.getByTestId('fab').click();
  await page.getByTestId('meal-text').fill('שקשוקה ולחם');
  await page.getByTestId('sheet-meal').getByTestId('save').click();
  await expect(page.getByTestId('obs-row').filter({ hasText: 'שקשוקה' })).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSynced(page);
  await expect.poll(async () => {
    const m = (await serverObservations(request, 'meal')).find((o) => String(o.values.description).includes('שקשוקה')) as unknown as { meal_items?: unknown[] } | undefined;
    return m?.meal_items?.length ?? 0;
  }, { timeout: 15_000 }).toBeGreaterThan(0);
});
