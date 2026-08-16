import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient, ConnectError } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { Button } from '../../components/ui/button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { BACKEND_URL } from '../../lib/backendUrl';
import { ListState } from '../../components/ui/ListState';

const authClient = createClient(AuthService, transport);

const INPUT_CLASS = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';

// Mirrors the backend's MIN_PASSWORD_LENGTH (lib/credentials.ts), the same
// way RegisterForm.tsx already does.
const MIN_PASSWORD_LENGTH = 12;

const PROVIDER_LABELS: Record<string, string> = { google: 'Google' };

/**
 * M13-T12. Where an authenticated user manages their own credentials: set
 * or change a password, and link/unlink Google. The last-sign-in-method
 * invariant (ADR-0012 §5) is enforced server-side (setPassword never
 * removes the only method; unlinkIdentity refuses to), but this screen
 * also disables an "unlink" control *before* it's clicked whenever it
 * would be the last one, computed from `listLinkedIdentities`'s
 * `hasPassword` (M13-T12) alongside how many identities are linked —
 * catching the server's refusal after the fact isn't the same UX as never
 * offering the button.
 */
export function AccountSettings() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const identitiesQuery = useQuery({
    queryKey: ['linkedIdentities'],
    queryFn: () => authClient.listLinkedIdentities({}),
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const hasPassword = identitiesQuery.data?.hasPassword ?? false;

  const setPasswordMutation = useMutation({
    mutationFn: () => authClient.setPassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      queryClient.invalidateQueries({ queryKey: ['linkedIdentities'] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (provider: string) => authClient.unlinkIdentity({ provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedIdentities'] });
    },
  });

  const handleSetPassword = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) return;
    if (hasPassword && !currentPassword) return;
    setPasswordMutation.mutate();
  };

  const handleLinkGoogle = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google/link`;
  };

  const handleUnlink = async (provider: string) => {
    const label = PROVIDER_LABELS[provider] ?? provider;
    const ok = await confirm({
      title: `Unlink ${label}?`,
      consequence: `You will no longer be able to sign in with ${label}.`,
      undo: `You can link ${label} again from this screen.`,
      confirmLabel: 'Unlink',
      destructive: true,
    });
    if (ok) unlinkMutation.mutate(provider);
  };

  const identities = identitiesQuery.data?.identities ?? [];
  const totalMethods = identities.length + (hasPassword ? 1 : 0);
  const isGoogleLinked = identities.some((i) => i.provider === 'google');
  const setPasswordError = setPasswordMutation.error as ConnectError | null;

  return (
    <div className="flex flex-col gap-6">
      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm max-w-2xl">
        <h2 className="text-xl font-medium mb-4">Password</h2>
        <form onSubmit={handleSetPassword} className="flex flex-col gap-3" aria-label={hasPassword ? 'Change your password' : 'Set a password'}>
          {hasPassword && (
            <div className="flex flex-col gap-1">
              <label htmlFor="settings-current-password" className="text-sm font-medium text-foreground">
                Current password
              </label>
              <input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="settings-new-password" className="text-sm font-medium text-foreground">
              {hasPassword ? 'New password' : 'Password'}
            </label>
            <input
              id="settings-new-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={INPUT_CLASS}
              required
            />
            <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
          </div>
          {setPasswordError && (
            <p role="alert" className="text-sm text-destructive">{setPasswordError.message}</p>
          )}
          {setPasswordMutation.isSuccess && (
            <p role="status" className="text-sm text-success">Password updated.</p>
          )}
          <Button
            type="submit"
            disabled={setPasswordMutation.isPending || newPassword.length < MIN_PASSWORD_LENGTH || (hasPassword && !currentPassword)}
            className="self-start"
          >
            {setPasswordMutation.isPending ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </form>
      </div>

      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm max-w-2xl">
        <h2 className="text-xl font-medium mb-4">Linked accounts</h2>

        {identitiesQuery.isLoading || identitiesQuery.error ? (
          <ListState
            isLoading={identitiesQuery.isLoading}
            error={identitiesQuery.error}
            isEmpty={false}
            loadingMessage="Loading linked accounts…"
            emptyMessage=""
            onRetry={() => identitiesQuery.refetch()}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {identities.map((identity) => {
              const label = PROVIDER_LABELS[identity.provider] ?? identity.provider;
              const isLastMethod = totalMethods <= 1;
              return (
                <li key={identity.provider} className="flex items-center justify-between p-3 rounded-md border">
                  <span className="text-sm">{label}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLastMethod || unlinkMutation.isPending}
                    title={isLastMethod ? 'This is your only sign-in method — set a password or link another account first.' : undefined}
                    onClick={() => handleUnlink(identity.provider)}
                  >
                    Unlink
                  </Button>
                </li>
              );
            })}
            {identities.length === 0 && (
              <p className="text-sm text-muted-foreground">No linked accounts.</p>
            )}
          </ul>
        )}

        {!isGoogleLinked && (
          <Button variant="inverted" className="mt-4" onClick={handleLinkGoogle}>
            Link Google account
          </Button>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
