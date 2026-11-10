import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const backend = process.env.TASKER_E2E_BACKEND_URL;
// This file will also exercise real one-time credentials: never retain them in
// test recordings. Explicit UI captures happen before token issuance only.
test.use({ trace: 'off', video: 'off', viewport: { width: 375, height: 812 } });
test.beforeEach(async ({ context }) => {
  if (backend) await context.route('http://localhost:8080/**', async route => { const url = new URL(route.request().url()); await route.continue({ url: new URL(url.pathname + url.search, backend).href }); });
});
test.afterEach(async ({ context }) => context.unrouteAll({ behavior: 'ignoreErrors' }));
async function rpc<T>(page: Page, service: string, method: string, body: object): Promise<T> {
  return page.evaluate(async ({ service, method, body }) => {
    const response = await fetch(`http://localhost:8080/tasker.health.v1.${service}/${method}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method}: ${response.status}`); return response.json();
  }, { service, method, body });
}
async function visibleFocus(page: Page) {
  const position = await page.evaluate(() => { const target = document.activeElement!.getBoundingClientRect(); const header = document.querySelector('header')?.getBoundingClientRect(); return { top: target.top, bottom: target.bottom, covered: header && header.height > 0 ? header.bottom : 0, height: innerHeight }; });
  expect(position.top).toBeGreaterThanOrEqual(position.covered); expect(position.bottom).toBeLessThanOrEqual(position.height);
}

test('a person creates the first role, registers an identity and opens one contextual connection section in both themes and mobile layout', async ({ page }) => {
  test.setTimeout(60_000); await page.goto('/agents'); await expect(page.getByRole('heading', { name: 'AI Agents', level: 1 })).toBeVisible();
  const stamp = Date.now().toString(36), name = `Browser worker ${stamp}`, roleName = `Release reviewer ${stamp}`;
  const { organization } = await rpc<{ organization: { id: string } }>(page, 'OrgService', 'SeedOrg', { name: `Registration browser ${stamp}`, slug: `registration-${stamp}` });
  await page.goto(`/agents?org=${organization.id}`); await expect(page.getByText('No agents registered yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Register agent', exact: true }).click(); await page.getByRole('textbox', { name: 'Agent name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create a role', exact: true }).click();
  const roleInput = page.getByRole('textbox', { name: 'Role name', exact: true }); await expect(roleInput).toBeFocused(); await visibleFocus(page);
  await roleInput.fill(roleName); await page.getByRole('textbox', { name: 'System prompt', exact: true }).fill('Inspect release evidence before handoff.');
  await page.getByRole('textbox', { name: 'Capabilities', exact: true }).fill('["review"]');
  const createdRole = page.waitForResponse(response => response.url().endsWith('/CreateAgentRole') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create role', exact: true }).click(); const roleResponse = await createdRole; expect(roleResponse.status()).toBe(200);
  const { role } = await roleResponse.json() as { role: { id: string } };
  const choice = page.getByRole('combobox', { name: 'Role', exact: true }); await expect(choice).toHaveValue(role.id); await expect(choice).toBeFocused(); await visibleFocus(page);
  await expect(page.getByRole('textbox', { name: 'Agent name', exact: true })).toHaveValue(name);
  const createdAgent = page.waitForResponse(response => response.url().endsWith('/CreateAgent') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Register', exact: true }).click(); const agentResponse = await createdAgent; expect(agentResponse.status()).toBe(200);
  const { agent } = await agentResponse.json() as { agent: { id: string; orgId: string } }; expect(agent.orgId).toBe(organization.id);
  const connection = page.getByRole('region', { name: `Connect ${name}`, exact: true }); await expect(connection.getByText('No tokens for this agent.', { exact: true })).toBeVisible();
  await expect(connection.getByRole('heading', { name: `Connect ${name}`, exact: true })).toBeFocused(); await visibleFocus(page);
  await expect(page.getByText(name, { exact: true })).toHaveCount(2);
  const captures = process.env.TASKER_AGENT_CAPTURE_DIR; if (captures) mkdirSync(captures, { recursive: true });
  for (const theme of ['Light', 'Dark']) {
    await page.setViewportSize({ width: 1280, height: 900 }); await expect.poll(() => page.locator('aside').first().evaluate(element => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
    await page.getByRole('radio', { name: theme, exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.locator('aside').first().evaluate((element, viewportWidth) => viewportWidth < 768 ? element.getBoundingClientRect().right <= 0 : element.getBoundingClientRect().left >= 0, width)).toBe(true);
      const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); expect(size.scroll).toBeLessThanOrEqual(size.width);
      if (captures) await page.screenshot({ path: `${captures}/registration-${theme.toLowerCase()}-${width}.png`, fullPage: true });
    }
  }
  await connection.getByRole('button', { name: 'Close connection setup', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Registered agents', exact: true })).toBeFocused(); await visibleFocus(page);
  const trigger = page.getByRole('button', { name: `Tokens for ${name}`, exact: true }); await trigger.click(); await expect(connection).toBeVisible();
  await connection.getByRole('button', { name: 'Close connection setup', exact: true }).click(); await expect(trigger).toBeFocused(); await visibleFocus(page);
});
