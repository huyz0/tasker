import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';
import { controlLiveFeed, currentFeed } from './controlledLiveFeed';

test.beforeEach(async ({ page, context }) => {
  // Optional local isolation: the product's endpoint remains unchanged. CI uses
  // its normal seeded :8080 backend; local proof can use a private test server.
  const privateBackend = process.env.TASKER_E2E_BACKEND_URL;
  if (privateBackend) {
    await context.route('http://localhost:8080/**', async route => {
      const requested = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(requested.pathname + requested.search, privateBackend).href });
      await route.fulfill({ response });
    });
  }
  await controlLiveFeed(page);
});

async function addFromAnotherPage(page: Page, title: string) {
  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.getByRole('button', { name: 'Add task to Todo' }).first().click();
  const input = other.getByPlaceholder('Task title');
  await input.fill(title);
  await input.press('Enter');
  await expect(other.getByRole('button', { name: title, exact: true })).toBeVisible({ timeout: 15_000 });
  return other;
}

async function openSeededProject(page: Page) {
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project' }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: /^Seed Project/i }).first().click();
  await expect(page.getByRole('button', { name: 'Add task to Todo' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 4 }).getByRole('button').first()).toBeVisible();
}

async function expectTaskRead(page: Page, action: () => Promise<unknown>) {
  const read = page.waitForRequest(request => request.url().endsWith('/tasker.health.v1.TaskService/ListTasks'), { timeout: 5000 });
  await action();
  const response = await (await read).response();
  expect(response?.ok()).toBe(true);
  await response?.finished();
}

test('one dropped stream reconciles a task created while disconnected, without another domain event', async ({ page }) => {
  await openSeededProject(page);
  const first = await currentFeed(page);
  const title = `Reconnect evidence ${Date.now()}`;
  await page.evaluate(id => {
    window.__recoveryFeed.autoReady = false;
    window.__recoveryFeed.drop(id);
  }, first);
  const next = await currentFeed(page);
  expect(next).toBeGreaterThan(first);
  const other = await addFromAnotherPage(page, title);
  try {
    // Keep the original page in the background: focusing it could independently
    // refetch queries and hide a broken reconnect implementation.
    await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await expectTaskRead(page, () => page.evaluate(id => window.__recoveryFeed.send(id, 'stream.ready'), next));
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible({ timeout: 5000 });
  } finally {
    await other.close();
  }
});

test('resync refreshes a dropped task entity while only an artifact event survives on the same connection', async ({ page }) => {
  await openSeededProject(page);
  const connection = await currentFeed(page);
  const title = `Overflow evidence ${Date.now()}`;
  const other = await addFromAnotherPage(page, title);
  try {
    await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await expectTaskRead(page, () => page.evaluate(id => {
      window.__recoveryFeed.send(id, 'stream.resync');
      window.__recoveryFeed.send(id, 'domain.artifact.updated');
    }, connection));
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible({ timeout: 5000 });
    expect(await currentFeed(page)).toBe(connection);
  } finally {
    await other.close();
  }
});

test('changing project abandons the pending old feed and keeps recovery in the new scope', async ({ page }) => {
  await openSeededProject(page);
  const projectA = new URL(page.url()).searchParams.get('project');
  const oldTitle = `Old scope evidence ${Date.now()}`;
  const oldWriter = await addFromAnotherPage(page, oldTitle);
  await oldWriter.close();
  const first = await currentFeed(page);
  await page.evaluate(id => {
    window.__recoveryFeed.autoReady = false;
    window.__recoveryFeed.drop(id);
  }, first);
  const abandoned = await currentFeed(page);
  await page.getByRole('button', { name: 'Active project' }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Bulk Project 00000');
  await page.getByRole('option', { name: 'Bulk Project 00000', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add task to Todo' }).first()).toBeVisible();
  await expect(page.getByText('Loading todo…', { exact: true })).toHaveCount(0);
  const current = await currentFeed(page);
  expect(new URL(page.url()).searchParams.get('project')).not.toBe(projectA);
  expect(await page.evaluate(id => window.__recoveryFeed.connections[id].open, abandoned)).toBe(false);
  await page.evaluate(id => window.__recoveryFeed.send(id, 'stream.ready'), current);
  const title = `New scope evidence ${Date.now()}`;
  const other = await addFromAnotherPage(page, title);
  try {
    await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await expectTaskRead(page, () => page.evaluate(id => window.__recoveryFeed.send(id, 'stream.resync'), current));
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: oldTitle, exact: true })).toHaveCount(0);
  } finally { await other.close(); }
});

test('repeated stream failures keep the screen fresh through offline polling', async ({ page }) => {
  await openSeededProject(page);
  const first = await currentFeed(page);
  await page.clock.install();
  await page.evaluate(id => {
    window.__recoveryFeed.rejectNew = true;
    window.__recoveryFeed.drop(id);
  }, first);
  let count = await page.evaluate(() => window.__recoveryFeed.connections.length);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.clock.fastForward(5000);
    await expect.poll(() => page.evaluate(() => window.__recoveryFeed.connections.length)).toBeGreaterThan(count);
    count = await page.evaluate(() => window.__recoveryFeed.connections.length);
  }
  await expect(page.getByRole('status', { name: 'Refreshing periodically', exact: true })).toBeVisible();
  const title = `Offline polling evidence ${Date.now()}`;
  const other = await addFromAnotherPage(page, title);
  try {
    await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await expectTaskRead(page, () => page.clock.fastForward(30_000));
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__recoveryFeed.connections.some(connection => connection.open))).toBe(false);
  } finally { await other.close(); }
});
