import { expect, test } from '@playwright/test';
import { enter } from './helpers';

test('S24: the time panel opens below the header without squeezing the title', async ({ page }, info) => {
  await enter(page);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('sheet-meal');
  const title = sheet.getByRole('heading');
  const before = await title.boundingBox();
  await sheet.getByTestId('timestamp').click();
  const panel = sheet.getByTestId('timestamp-panel');
  await expect(panel).toBeVisible();
  const after = await title.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 0); // title keeps its width; panel overlays below
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(after!.y + after!.height);
  await expect(panel.locator('[aria-pressed="true"]')).toBeInViewport(); // the chosen day is on screen
  await page.screenshot({ path: info.outputPath(`timestamp-panel-${info.project.name}.png`) });
  await panel.getByRole('button', { name: /^(Set|קבע)$/ }).click();
  await expect(panel).toBeHidden();
});

test('quick slot: Lunch picked late in the day moves the time to lunch, marked as an estimate', async ({ page }) => {
  await page.clock.setFixedTime(new Date(new Date().setHours(21, 0, 0, 0)));
  await enter(page);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('sheet-meal');
  await sheet.getByTestId('slot-lunch').click();
  await expect(sheet.getByTestId('timestamp')).toContainText('~13:00');
  await sheet.getByTestId('slot-lunch').click(); // untoggle → back to now
  await expect(sheet.getByTestId('timestamp')).not.toContainText('~');
});
