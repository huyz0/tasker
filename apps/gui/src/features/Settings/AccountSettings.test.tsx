import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSetPassword = vi.fn();
const mockListLinkedIdentities = vi.fn();
const mockUnlinkIdentity = vi.fn();

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ AuthService: 'AuthService' }));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: () => ({
    setPassword: (...a: unknown[]) => mockSetPassword(...a),
    listLinkedIdentities: (...a: unknown[]) => mockListLinkedIdentities(...a),
    unlinkIdentity: (...a: unknown[]) => mockUnlinkIdentity(...a),
  }),
}));

import { AccountSettings } from './AccountSettings';
import { ConnectError, Code } from '@connectrpc/connect';
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

describe('AccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListLinkedIdentities.mockResolvedValue({ identities: [], hasPassword: false });
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
      mockSetPassword.mockResolvedValue({ success: true });
      renderSettings();
      await screen.findByRole('button', { name: 'Set password' });

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

      await waitFor(() => expect(mockSetPassword).toHaveBeenCalledWith({ currentPassword: '', newPassword: VALID_PASSWORD }));
    });
  });

  describe('password section — existing password', () => {
    beforeEach(() => {
      mockListLinkedIdentities.mockResolvedValue({ identities: [], hasPassword: true });
    });

    it('offers "Change password" and requires the current password', async () => {
      renderSettings();
      expect(await screen.findByRole('button', { name: 'Change password' })).toBeDefined();
      const button = screen.getByRole('button', { name: 'Change password' });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      expect(button).toBeDisabled(); // current password still empty
    });

    it('submits both currentPassword and newPassword', async () => {
      mockSetPassword.mockResolvedValue({ success: true });
      renderSettings();
      await screen.findByRole('button', { name: 'Change password' });

      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'the-old-password-1' } });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

      await waitFor(() => expect(mockSetPassword).toHaveBeenCalledWith({
        currentPassword: 'the-old-password-1', newPassword: VALID_PASSWORD,
      }));
    });

    it('shows the server error on a wrong current password', async () => {
      mockSetPassword.mockRejectedValue(new ConnectError('currentPassword is missing or incorrect', Code.PermissionDenied));
      renderSettings();
      await screen.findByRole('button', { name: 'Change password' });

      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('currentPassword is missing or incorrect');
    });

    it('clears the fields and shows a success message after changing', async () => {
      mockSetPassword.mockResolvedValue({ success: true });
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
      mockListLinkedIdentities.mockResolvedValue({
        identities: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
        hasPassword: true,
      });
      renderSettings();

      expect(await screen.findByText('Google')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Link Google account' })).toBeNull();
    });

    it('disables Unlink with a reason when it is the only remaining sign-in method', async () => {
      mockListLinkedIdentities.mockResolvedValue({
        identities: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
        hasPassword: false, // one identity, no password — the last method
      });
      renderSettings();

      const unlinkButton = await screen.findByRole('button', { name: 'Unlink' });
      expect(unlinkButton).toBeDisabled();
      expect(unlinkButton.title).toContain('only sign-in method');
    });

    it('allows unlinking when a password also exists, after confirming', async () => {
      mockListLinkedIdentities.mockResolvedValue({
        identities: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
        hasPassword: true,
      });
      mockUnlinkIdentity.mockResolvedValue({ success: true });
      renderSettings();

      const unlinkButton = await screen.findByRole('button', { name: 'Unlink' });
      expect(unlinkButton).not.toBeDisabled();
      fireEvent.click(unlinkButton);

      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));

      await waitFor(() => expect(mockUnlinkIdentity).toHaveBeenCalledWith({ provider: 'google' }));
    });

    it('renders the query error when listLinkedIdentities fails, with a working retry', async () => {
      mockListLinkedIdentities.mockRejectedValueOnce(new Error('network down'));
      renderSettings();

      expect(await screen.findByRole('alert')).toHaveTextContent('network down');

      mockListLinkedIdentities.mockResolvedValue({ identities: [], hasPassword: false });
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
