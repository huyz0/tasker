import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const manifestPath = process.env.TASKER_ATTENTION_FIXTURE_MANIFEST;
const owned = process.env.TASKER_ATTENTION_OWNED_FIXTURE === '1';
const backend = process.env.TASKER_E2E_BACKEND_URL;
interface Source { sourceId: string; taskId: string; taskDisplayId: string; projectId: string; }
interface SourcePage { items?: Source[]; page?: { totalCount?: number; nextCursor?: string }; }
const labels = { question: 'Questions', approval: 'Approvals', review: 'Your reviews', stalled_claim: 'Stalled claims' };
type Kind = keyof typeof labels;
async function rpc<T>(page: Page, service: string, method: string, body: object): Promise<T> {
  return page.evaluate(async ({ service, method, body }) => {
    const response = await fetch(`http://localhost:8080/tasker.health.v1.${service}/${method}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method}: ${response.status}`); return response.json();
  }, { service, method, body });
}
async function sources(page: Page, orgId: string, kind: Kind) {
  const rows: Source[] = []; let cursor: string | undefined;
  do { const response = await rpc<SourcePage>(page, 'AttentionService', 'ListAttention', { orgId, kind, page: { limit: 20, cursor } });
    expect(response.items?.length ?? 0).toBeLessThanOrEqual(20); rows.push(...response.items ?? []); cursor = response.page?.nextCursor;
    expect(rows.length).toBeLessThan(1000);
  } while (cursor);
  expect(new Set(rows.map(row => row.sourceId)).size).toBe(rows.length); return rows;
}

test('all four source groups page beyond50 and resolve through current task controls in the owned integration fixture', async ({ page, context }) => {
  test.skip(!owned || !manifestPath, 'Explicit integration fixture only; default journeys create their own small organizations.');
  test.setTimeout(90_000);
  const fixture = JSON.parse(readFileSync(manifestPath!, 'utf8')) as { orgId: string; taskIds: string[] };
  expect(fixture.taskIds).toHaveLength(125); expect(fixture.taskIds.every(id => id.startsWith('attention-task-'))).toBe(true);
  if (backend) await context.route('http://localhost:8080/**', async route => { const url = new URL(route.request().url()); await route.continue({ url: new URL(url.pathname + url.search, backend).href }); });
  try {
    await page.goto(`/attention?org=${fixture.orgId}&kind=question`);
    await expect(page.getByRole('heading', { name: 'Attention', level: 1 })).toBeVisible();
    for (const kind of Object.keys(labels) as Kind[]) {
      const current = await sources(page, fixture.orgId, kind); expect(current.length).toBeGreaterThan(50);
      await page.goto(`/attention?org=${fixture.orgId}&kind=${kind}`);
      const region = page.getByRole('region', { name: labels[kind], exact: true }); let loaded = Math.min(20, current.length);
      await expect(region.getByText(`${loaded} loaded of ${current.length}`, { exact: true })).toBeVisible();
      while (loaded < current.length) { await region.getByRole('button', { name: /^Load more/ }).click(); loaded = Math.min(loaded + 20, current.length); await expect(region.getByText(`${loaded} loaded of ${current.length}`, { exact: true })).toBeVisible(); }
      const links = region.getByRole('link', { name: /^Open task/ }); await expect(links).toHaveCount(current.length);
      const urls = await links.evaluateAll(elements => elements.map(element => element.getAttribute('href')!));
      for (const row of current) expect(urls).toContain(`/tasks/${row.taskId}?${new URLSearchParams({ org: fixture.orgId, project: row.projectId })}`);
      await expect(region.getByRole('button', { name: /^Load more/ })).toHaveCount(0);
    }
    const used = new Set<string>();
    for (const kind of Object.keys(labels) as Kind[]) {
      const before = await sources(page, fixture.orgId, kind), row = before.find(source => fixture.taskIds.includes(source.taskId) && !used.has(source.taskId))!; expect(row).toBeTruthy(); used.add(row.taskId);
      await page.goto(`/attention?org=${fixture.orgId}&kind=${kind}`); const region = page.getByRole('region', { name: labels[kind], exact: true });
      const link = region.getByRole('link', { name: `Open task ${row.taskDisplayId}`, exact: true });
      while (!await link.count()) { await region.getByRole('button', { name: /^Load more/ }).click(); await expect(region.getByRole('button', { name: 'Loading more…' })).toHaveCount(0); }
      const prior = await rpc<{ task: { status: string } }>(page, 'TaskService', 'GetTask', { taskId: row.taskId });
      await link.click(); const detail = page.getByRole('dialog', { name: 'Task Details', exact: true }); await expect(detail).toBeVisible();
      if (kind === 'question') { const questions = detail.getByRole('region', { name: 'Questions from agents' }); await questions.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Use the staging target'); await questions.getByRole('button', { name: 'Answer', exact: true }).click(); await expect(questions.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveCount(0); }
      if (kind === 'approval') { await detail.getByRole('button', { name: 'Approve move', exact: true }).click(); await expect(detail.getByRole('button', { name: 'Approve move', exact: true })).toHaveCount(0); }
      if (kind === 'review') { await detail.getByRole('button', { name: /as a reviewer$/ }).click(); await expect(detail.getByText('No reviewers', { exact: true })).toBeVisible(); }
      if (kind === 'stalled_claim') { await detail.getByRole('button', { name: /^Remove .* from this task$/ }).click(); await expect(detail.getByRole('button', { name: 'Unassigned — assign this task', exact: true })).toBeVisible(); }
      await page.goBack(); await expect(page.getByRole('region', { name: labels[kind], exact: true }).getByText(new RegExp(`loaded of ${before.length - 1}$`))).toBeVisible();
      expect((await sources(page, fixture.orgId, kind)).some(source => source.sourceId === row.sourceId)).toBe(false);
      const current = await rpc<{ task: { status: string } }>(page, 'TaskService', 'GetTask', { taskId: row.taskId }); expect(current.task.status).toBe(kind === 'approval' ? 'shipped' : prior.task.status);
    }
    // Archiving changes current parent eligibility, not the pending sources.
    const snapshots = new Map<Kind, Source[]>();
    for (const kind of Object.keys(labels) as Kind[]) snapshots.set(kind, await sources(page, fixture.orgId, kind));
    const candidate = snapshots.get('question')!.find(source => fixture.taskIds.includes(source.taskId) && [...snapshots.values()].every(rows => rows.some(row => row.taskId === source.taskId)))!;
    expect(candidate).toBeTruthy();
    await rpc(page, 'TaskService', 'DeleteTask', { taskId: candidate.taskId });
    try {
      for (const kind of Object.keys(labels) as Kind[]) {
        await page.goto(`/attention?org=${fixture.orgId}&kind=${kind}`);
        await expect(page.getByRole('region', { name: labels[kind], exact: true }).getByText(`20 loaded of ${snapshots.get(kind)!.length - 1}`, { exact: true })).toBeVisible();
        expect((await sources(page, fixture.orgId, kind)).some(row => row.taskId === candidate.taskId)).toBe(false);
      }
    } finally { await rpc(page, 'TaskService', 'RestoreTask', { taskId: candidate.taskId }); }
    for (const kind of Object.keys(labels) as Kind[]) {
      const original = snapshots.get(kind)!.find(row => row.taskId === candidate.taskId)!;
      expect((await sources(page, fixture.orgId, kind)).some(row => row.sourceId === original.sourceId)).toBe(kind !== 'stalled_claim');
    }
    const held = await rpc<{ task: { assignees: object[]; status: string } }>(page, 'TaskService', 'GetTask', { taskId: candidate.taskId });
    expect(held.task.assignees).toHaveLength(1); expect(held.task.status).toBe('working');
    // Archive/restore records real activity: the hold survives, silence resets.
    const questions = await rpc<{ inputRequests: { id: string; status: string }[] }>(page, 'TaskService', 'ListInputRequests', { taskId: candidate.taskId, status: 'open' });
    expect(questions.inputRequests.some(row => row.id === snapshots.get('question')!.find(row => row.taskId === candidate.taskId)!.sourceId && row.status === 'open')).toBe(true);
    const approvals = await rpc<{ approvals: { id: string; status: string }[] }>(page, 'TaskService', 'ListTransitionApprovals', { taskId: candidate.taskId, status: 'pending' });
    expect(approvals.approvals.some(row => row.id === snapshots.get('approval')!.find(row => row.taskId === candidate.taskId)!.sourceId && row.status === 'pending')).toBe(true);
  } finally { await context.unrouteAll({ behavior: 'ignoreErrors' }); }
});
