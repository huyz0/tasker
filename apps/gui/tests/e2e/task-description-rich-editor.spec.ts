import { test, expect } from '@playwright/test';

test.describe('Rich markdown editor E2E', () => {
  test('bolding text via the toolbar round-trips as markdown, confirmed by a fresh getTask read', async ({ page }) => {
    // Needs a backend seeded with at least one task - `bun run seed` from
    // apps/backend, which CI does before this job (mirrors comments.spec.ts).
    await page.goto('/tasks');

    // The task title is itself the button that opens the task — see the note
    // in comments.spec.ts: the card stopped being a `role="button"` div when a
    // UX review flagged the resulting axe `nested-interactive` violation, so
    // the real control moved inside the h4.
    const taskTitle = page.locator('h4 > button').first();
    await expect(taskTitle).toBeVisible({ timeout: 30_000 });
    await taskTitle.click();

    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible();
    const taskId = page.url().split('/tasks/')[1];
    // Scoped to the dialog's own header row (the "Task Details" heading's
    // parent, which also holds this Edit button as a sibling) rather than
    // page-wide: this task may already have comments from a previous run of
    // this spec or of comments.spec.ts (same seeded "first task"), and each
    // comment has its own identically-labelled "Edit" button.
    const dialogHeader = page.getByRole('heading', { name: 'Task Details' }).locator('..');
    await dialogHeader.getByRole('button', { name: 'Edit' }).click();

    // The editor is lazy-loaded (M23-T03) - wait for its toolbar, not just the
    // Suspense fallback, before typing. MDXEditor's Bold/Italic/Underline
    // toggles render as a Radix single-select toggle group, which exposes
    // "radio" as its ARIA role (a mutually-exclusive-looking group), not
    // "button" - confirmed against the real accessibility tree, not guessed.
    // Its accessible name flips between "Bold" and "Remove bold" depending
    // on whether the cursor is already inside bold-formatted text, which
    // matters here: a previous run of this same test against this same
    // seeded task can leave bold formatting active at the cursor even after
    // every character is deleted (Lexical carries the last format forward
    // through a delete-all), so "Bold" alone isn't a safe locator across
    // repeated runs.
    const boldToggle = page.getByRole('radio', { name: /bold/i });
    await expect(boldToggle).toBeVisible();

    const stamp = String(Date.now());
    // By role, not by class: MDXEditor renders its placeholder in a second
    // element carrying the same `rich-markdown-editor-content` class, so the
    // class selector matches two nodes — but only when the description is
    // empty, which is why this passed for a seeded task with body text and
    // broke the moment the first card had none. The editable surface is the
    // one with the textbox role.
    const content = page.getByRole('textbox', { name: 'editable markdown' });
    await content.click();
    // Clear whatever the seed fixture (or a previous run) put here first, so
    // the assertion below can check an exact string, and repeated runs don't
    // accumulate text onto the same seeded task forever.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    // Reset to a known, unformatted starting point: if deleting everything
    // left bold "on" for whatever gets typed next, turn it back off first.
    if ((await boldToggle.getAttribute('aria-label')) === 'Remove bold') {
      await boldToggle.click();
    }
    await page.keyboard.type(`E2E ${stamp} bold check`);

    // Real typing, then a real toolbar action - not the markdown-shortcut
    // plugin's **text** auto-formatting, which would prove the plugin works
    // but not the toolbar. Shift+Home selects back to the start of this one
    // line precisely, rather than reusing Ctrl+A a second time - repeating
    // Ctrl+A here was flaky (the toolbar transiently disappeared), and this
    // sidesteps that race entirely instead of chasing it.
    await page.keyboard.press('Shift+Home');
    await expect(boldToggle).toHaveAttribute('aria-label', 'Bold');
    await boldToggle.click();

    await page.getByRole('button', { name: 'Save' }).click();

    // Edit mode closes and the rendered MarkdownRenderer view takes over.
    const rendered = page.locator('strong', { hasText: stamp });
    await expect(rendered).toBeVisible();
    await expect(dialogHeader.getByRole('button', { name: 'Edit' })).toBeVisible();

    // Confirm the save round-tripped through the server as plain markdown,
    // not just local React Query cache and not merely "renders bold" (which
    // an HTML-native editor could also manage while silently drifting the
    // underlying string - the exact risk ADR-0018 chose MDXEditor to avoid).
    // A page reload can't be used here: it re-hits a pre-existing, unrelated
    // bug where a deep link to /tasks/:taskId loses its route once
    // activeProjectId finishes hydrating on a fresh load (Tasks/index.tsx's
    // "closes the detail overlay when the active project changes" effect)
    // - out of scope for this milestone. A direct getTask call proves the
    // same thing (a fresh server read, bypassing any client cache) without
    // depending on that unrelated code path.
    const getTaskResponse = await page.request.post(`http://localhost:8080/tasker.health.v1.TaskService/GetTask`, {
      headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
      data: { taskId },
    });
    expect(getTaskResponse.ok()).toBe(true);
    const { task } = await getTaskResponse.json();
    expect(task.description).toBe(`**E2E ${stamp} bold check**`);
  });
});
