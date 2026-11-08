import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

for (const width of [375, 768, 1280]) {
  for (const kind of ['workflow', 'schedule']) {
    test(`${kind} empty/create/cancel flow uses the available width at ${width}px`, async ({ page }) => {
      await selectSeededOrg(page);
      await page.getByRole('button', { name: 'Active project', exact: true }).click();
      await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
      await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
      const scope = new URL(page.url()).search;
      const service = kind === 'workflow' ? 'WorkflowService/ListWorkflowTemplates' : 'ScheduleService/ListSchedules';
      const field = kind === 'workflow' ? 'templates' : 'schedules';
      // A deterministic empty collection while the actual shell, editor and routing remain real.
      await page.route(`**/tasker.health.v1.${service}`, route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true' },
        body: JSON.stringify({ [field]: [], page: {} }),
      }));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${kind}s${scope}`);
      await expect(page.getByRole('heading', { level: 2, name: `No ${kind}s yet.` })).toBeVisible();
      await expect(page.getByText(`Choose a ${kind} on the left, or create one.`, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: `New ${kind}`, exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: `New ${kind}`, exact: true }).click();
      const name = page.getByRole('textbox', { name: 'Name', exact: true });
      await expect(name).toBeVisible();
      expect((await name.boundingBox())!.width).toBeGreaterThan(240);
      expect((await name.boundingBox())!.x + (await name.boundingBox())!.width).toBeLessThanOrEqual(width);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('heading', { level: 2, name: `No ${kind}s yet.` })).toBeVisible();
      expect(new URL(page.url()).search).toBe(scope);
    });
  }
}
