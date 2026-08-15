import { screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Drives the `ConfirmDialog` that replaced `window.confirm` in M06-T04.
 *
 * `vi.spyOn(window, 'confirm').mockReturnValue(true)` used to stand in for a
 * user decision. It could not: it asserted nothing about what the user was
 * shown, so a dialog that said the wrong thing — or said nothing about whether
 * the action could be undone — passed identically.
 *
 * These helpers act on the real dialog, so a test that confirms an action also
 * proves the dialog appeared.
 */

/** Waits for the confirmation to appear and presses its confirming button. */
export async function confirmAction(): Promise<void> {
  const dialog = await screen.findByTestId('confirm-dialog');
  const buttons = within(dialog).getAllByRole('button');
  // The last button is the confirming one; Cancel comes first so that it takes
  // focus on open, which is the safer default for a destructive action.
  fireEvent.click(buttons[buttons.length - 1]);
  await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
}

/** Waits for the confirmation to appear and dismisses it. */
export async function cancelAction(): Promise<void> {
  const dialog = await screen.findByTestId('confirm-dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
}
