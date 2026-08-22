import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';

import { AccountSettings } from './AccountSettings';
import { expectNoA11yViolations } from '../../test/a11y';
import { BACKEND_URL } from '../../lib/backendUrl';

const VALID_PASSWORD = 'a-strong-password-123';

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSettings />
    </QueryClientProvider>,
  );
}

/** Registers SetPassword and records every request it receives. */
function withSetPassword(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(AuthService, 'SetPassword', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('AccountSettings', () => {
  beforeEach(() => {
    mockRpc(AuthService, 'ListLinkedIdentities', { identities: [], hasPassword: false });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderSettings();
    await screen.findByRole('button', { name: 'Set password' });
    await expectNoA11yViolations(container);
  });

  describe('password section — no existing password', () => {
    it('offers "Set password", not "Change password", and no current-password field', async () => {
      renderSettings();
      expect(await screen.findByRole('button', { name: 'Set password' })).toBeDefined();
      expect(screen.queryByLabelText('Current password')).toBeNull();
    });

    it('sets a password with an empty currentPassword — nothing to prove yet', async () => {
      const requests = withSetPassword();
      renderSettings();
      await screen.findByRole('button', { name: 'Set password' });

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

      // An empty `currentPassword` is proto3's default for a string field, so
      // the real JSON codec omits it from the wire rather than sending ''.
      await waitFor(() => expect(requests).toContainEqual({ newPassword: VALID_PASSWORD }));
    });
  });

  describe('password section — existing password', () => {
    beforeEach(() => {
      mockRpc(AuthService, 'ListLinkedIdentities', { identities: [], hasPassword: true });
    });

    it('offers "Change password" and requires the current password', async () => {
      renderSettings();
      expect(await screen.findByRole('button', { name: 'Change password' })).toBeDefined();
      const button = screen.getByRole('button', { name: 'Change password' });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      expect(button).toBeDisabled(); // current password still empty
    });

    it('submits both currentPassword and newPassword', async () => {
      const requests = withSetPassword();
      renderSettings();
      await screen.findByRole('button', { name: 'Change password' });

      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'the-old-password-1' } });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

      await waitFor(() => expect(requests).toContainEqual({
        currentPassword: 'the-old-password-1', newPassword: VALID_PASSWORD,
      }));
    });

    it('shows the server error on a wrong current password', async () => {
      mockRpcError(AuthService, 'SetPassword', 'permission_denied', 'currentPassword is missing or incorrect');
      renderSettings();
      await screen.findByRole('button', { name: 'Change password' });

      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('currentPassword is missing or incorrect');
    });

    it('clears the fields and shows a success message after changing', async () => {
      withSetPassword();
      renderSettings();
      await screen.findByRole('button', { name: 'Change password' });

      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'the-old-password-1' } });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Password updated.');
      expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
    });
  });

  describe('linked accounts', () => {
    it('shows "No linked accounts" and a Link Google button when nothing is linked', async () => {
      renderSettings();
      expect(await screen.findByText('No linked accounts.')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Link Google account' })).toBeDefined();
    });

    it('lists a linked Google identity and hides the link button once linked', async () => {
      mockRpc(AuthService, 'ListLinkedIdentities', {
        identities: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
        hasPassword: true,
      });
      renderSettings();

      expect(await screen.findByText('Google')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Link Google account' })).toBeNull();
    });

    it('disables Unlink with a reason when it is the only remaining sign-in method', async () => {
      mockRpc(AuthService, 'ListLinkedIdentities', {
        identities: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
        hasPassword: false, // one identity, no password — the last method
      });
      renderSettings();

      const unlinkButton = await screen.findByRole('button', { name: 'Unlink' });
      expect(unlinkButton).toBeDisabled();
      expect(unlinkButton.title).toContain('only sign-in method');
    });

    it('allows unlinking when a password also exists, after confirming', async () => {
      mockRpc(AuthService, 'ListLinkedIdentities', {
        identities: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
        hasPassword: true,
      });
      const requests: any[] = [];
      mockRpc(AuthService, 'UnlinkIdentity', (body) => {
        requests.push(body);
        return { success: true };
      });
      renderSettings();

      const unlinkButton = await screen.findByRole('button', { name: 'Unlink' });
      expect(unlinkButton).not.toBeDisabled();
      fireEvent.click(unlinkButton);

      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));

      await waitFor(() => expect(requests).toContainEqual({ provider: 'google' }));
    });

    it('renders the query error when listLinkedIdentities fails, with a working retry', async () => {
      mockRpcError(AuthService, 'ListLinkedIdentities', 'unknown', 'network down');
      renderSettings();

      expect(await screen.findByRole('alert')).toHaveTextContent('network down');

      mockRpc(AuthService, 'ListLinkedIdentities', { identities: [], hasPassword: false });
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('No linked accounts.')).toBeDefined();
    });

    it('redirects to the backend\'s Google link route via the shared BACKEND_URL', async () => {
      const location = { ...window.location, href: '' };
      vi.stubGlobal('location', location);
      renderSettings();

      fireEvent.click(await screen.findByRole('button', { name: 'Link Google account' }));

      expect(window.location.href).toBe(`${BACKEND_URL}/api/auth/google/link`);
      vi.unstubAllGlobals();
    });
  });
});
