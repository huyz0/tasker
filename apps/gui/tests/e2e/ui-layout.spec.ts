import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

async function openSeededWork(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  await expect(page.getByRole('heading', { level: 4 }).first()).toBeVisible();
}

for (const width of [768, 1024]) {
  test(`task heading and every filter remain readable at ${width}px`, async ({ page }) => {
    await openSeededWork(page);
    await page.setViewportSize({ width, height: 900 });
    const heading = page.getByRole('heading', { level: 1, name: 'Tasks', exact: true });
    await expect.poll(async () => (await heading.boundingBox())?.width ?? 0).toBeGreaterThan(180);
    for (const control of [page.getByRole('button', { name: 'Table', exact: true }), page.getByPlaceholder('Filter tasks…'), page.getByRole('button', { name: 'Waiting on people', exact: true })]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
  });
}

test('mobile task content and properties share usable scrolling and preserve history', async ({ page }) => {
  await openSeededWork(page);
  await page.getByRole('heading', { level: 4 }).getByRole('button').first().click();
  const taskUrl = page.url();
  await page.setViewportSize({ width: 375, height: 900 });
  const dialog = page.getByRole('dialog');
  const title = dialog.getByRole('heading', { level: 3 }).first();
  await expect.poll(() => title.evaluate(element => {
    let owner = element.parentElement;
    while (owner && getComputedStyle(owner).overflowY !== 'auto') owner = owner.parentElement;
    return owner?.clientHeight ?? 0;
  })).toBeGreaterThan(160);
  await expect(title).toBeInViewport({ ratio: 1 });
  await dialog.getByRole('combobox', { name: 'Priority', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('combobox', { name: 'Priority', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Close task details', exact: true }).click();
  expect(new URL(page.url()).search).toBe(new URL(taskUrl).search);
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
});
