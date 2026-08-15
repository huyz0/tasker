import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const authClient = createClient(AuthService, transport);

/**
 * The signed-in account, from `getIdentity`.
 *
 * The header used to render a generic `UserCircle` for everyone — which said
 * "a user" rather than "you", and said it identically whoever was logged in.
 * `getIdentity` had no caller in the GUI at all.
 *
 * When the identity is unknown — loading, signed out, or the call failed — this
 * renders nothing. A stand-in avatar in those states is precisely the
 * fabrication M05 exists to remove: it would look like a resolved account.
 */
export function CurrentUser() {
  const { data } = useQuery({
    queryKey: ['identity'],
    queryFn: async () => (await authClient.getIdentity({})).user,
    // The signed-in account does not change under us, and a failure here means
    // signed out - retrying it just delays rendering the rest of the shell.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return null;

  const label = data.name || data.email;
  // Derived from the real account, so it is an initial rather than a
  // placeholder. M05-T02 removed a literal "U" for exactly this distinction.
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2" aria-label={`Signed in as ${label}`}>
      {data.avatarUrl ? (
        <img src={data.avatarUrl} alt={label} className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span
          data-testid="current-user-initial"
          aria-hidden="true"
          className="h-6 w-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold"
        >
          {initial}
        </span>
      )}
      <span className="text-sm text-muted-foreground hidden sm:inline max-w-[12rem] truncate">{label}</span>
    </div>
  );
}
