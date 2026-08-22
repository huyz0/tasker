import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

test.describe('Comments E2E rendering', () => {
  test('Creating a task comment with markdown bold rendering', async ({ page }) => {
    // Needs a backend seeded with at least one task - `bun run seed` from
    // apps/backend, which CI does before this job. Explicit, not just
    // `page.goto('/tasks')`: the switcher auto-selects whichever org is
    // newest, and `journeys/core-journey.spec.ts` creates one of its own -
    // this pins the org this spec actually needs regardless of what else in
    // the suite ran first.
    await selectSeededOrg(page);

    // The task title *is* the button now, so it is what opens the task.
    //
    // This used to locate the card as "the role=button containing an h4",
    // because the whole card was a `role="button"` div. A UX review found that
    // made every card an axe `nested-interactive` violation (the card
    // announced as a button while containing the assignee picker's own
    // button), so the roles were inverted: the card is a plain draggable
    // container and the h4 holds a real <button>. Same click target as before
    // — clicking the title — reached through the structure that replaced it.
    const taskTitle = page.locator('h4 > button').first();
    await expect(taskTitle).toBeVisible({ timeout: 30_000 });
    await taskTitle.click();

    // Opening a card is a route change now (`/tasks/:taskId`), so wait for the
    // detail overlay before typing into it.
    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible();

    // M23 follow-up: the comment box became a `RichMarkdownEditor`
    // (`CommentComposer.tsx`), a Lexical contenteditable with no native
    // `placeholder` attribute at all - `getByPlaceholder` can never match it,
    // regardless of the text MDXEditor's own placeholder plugin renders.
    // Its accessible name is a hardcoded MDXEditor default
    // ("editable markdown", the same on every instance regardless of the
    // `placeholder` prop) - unambiguous here because this spec never opens
    // the task's own description editor, so the comment composer is the only
    // rich editor mounted.
    const stamp = String(Date.now());
    const commentBox = page.getByRole('textbox', { name: 'editable markdown' });
    await commentBox.click();
    // Real keystrokes, not `.fill()`: `.fill()` sets the value in one shot
    // without the sequential keystrokes markdownShortcutPlugin listens for,
    // so `**bold**` typed that way stays literal text instead of becoming
    // real bold formatting - this spec is specifically about that shortcut
    // converting live, not about the toolbar (task-description-rich-editor
    // .spec.ts covers the toolbar instead).
    await page.keyboard.type(`E2E **bold** check ${stamp}`);
    await page.getByRole('button', { name: /post comment/i }).click();

    // Anchored to this run's stamp. Asserting on any `strong` containing "bold"
    // would pass on a comment left behind by a previous run, so the test would
    // survive the post silently failing.
    const posted = page.locator('p', { hasText: `check ${stamp}` }).first();
    await expect(posted).toBeVisible();
    await expect(posted.locator('strong', { hasText: 'bold' })).toBeVisible();
  });
});
