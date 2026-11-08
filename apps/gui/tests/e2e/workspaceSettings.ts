import type { Page } from '@playwright/test';

/** Follow the same explicit administration disclosure as a person using the sidebar. */
export async function openWorkspaceSettings(page: Page): Promise<void> {
  const disclosure = page.getByRole('button', { name: 'Workspace settings', exact: true });
  if (await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click();
}
