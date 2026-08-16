import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { AgentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useConfirm } from '../../components/ui/ConfirmDialog';

const agentClient = createClient(AgentService, transport);

/**
 * ADR-0008's vocabulary, shown verbatim. The string is what appears in the CLI,
 * in the ADR, and in the error an agent gets when it lacks one — a friendlier
 * label here would mean the UI and the error message disagree about what the
 * thing is called.
 */
const SCOPES = [
  'tasks:read',
  'tasks:write',
  'comments:write',
  'artifacts:read',
  'artifacts:write',
  'projects:read',
  'agents:read',
  'repos:read',
];

const relativeDays = (iso: string): string => {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days === 0) return 'expires today';
  return `expires in ${days} day${days === 1 ? '' : 's'}`;
};

export function AgentTokens({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState('');
  // Held until dismissed by hand. A timer that expires while someone is
  // switching to their password manager destroys the only copy there is.
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const tokensQuery = useQuery({
    queryKey: ['agentTokens', agentId],
    queryFn: async () => (await agentClient.listAgentTokens({ agentId })).tokens,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      agentClient.createAgentToken({
        agentId,
        name: name.trim(),
        scopes,
        expiresInDays: expiresInDays ? Number(expiresInDays) : 0,
      }),
    onSuccess: (resp) => {
      setPlaintext(resp.plaintext);
      setName('');
      setScopes([]);
      setExpiresInDays('');
      setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ['agentTokens', agentId] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      await agentClient.revokeAgentToken({ tokenId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agentTokens', agentId] }),
  });

  // listAgentTokens is admin-gated, so a member would open this panel into a
  // permission error. Gated on isSuccess rather than !isError because the
  // latter is true while the query is still in flight, which renders the whole
  // section and then removes it - worse than never showing it (M03-T13).
  if (!tokensQuery.isSuccess) {
    return tokensQuery.isLoading
      ? <div className="p-3 text-sm text-muted-foreground">Loading tokens...</div>
      : null;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plaintext!);
      setCopyFailed(false);
    } catch {
      // clipboard is unavailable over plain HTTP in some browsers. A Copy
      // button that silently does nothing, on the one screen where the value
      // cannot be recovered, is worse than no button.
      setCopyFailed(true);
    }
  };

  return (
    <div className="p-3 bg-muted/20 border-t">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium">Tokens</h3>
        <button
          onClick={() => setIsCreating((v) => !v)}
          className="text-xs px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium"
        >
          {isCreating ? 'Cancel' : 'New token'}
        </button>
      </div>

      {plaintext && (
        <div role="status" className="mb-3 p-3 border rounded-md bg-card">
          <p className="text-xs font-medium mb-2">
            This is the only time this token will be shown.
          </p>
          <code className="block text-xs break-all p-2 bg-muted rounded select-all">{plaintext}</code>
          <div className="flex gap-2 items-center mt-2">
            <button onClick={copy} className="text-xs text-primary">Copy</button>
            <button
              onClick={() => { setPlaintext(null); setCopyFailed(false); }}
              className="text-xs text-muted-foreground"
            >
              I've saved it
            </button>
            {copyFailed && (
              <span className="text-xs text-destructive">
                Could not copy automatically - select the text above.
              </span>
            )}
          </div>
        </div>
      )}

      {isCreating && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="mb-3 p-3 border rounded-md flex flex-col gap-2 bg-card"
        >
          <label className="text-xs font-medium" htmlFor={`token-name-${agentId}`}>Name</label>
          <input
            id={`token-name-${agentId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CI worker"
            className="bg-transparent border rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />

          <fieldset className="border rounded-md p-2">
            <legend className="text-xs font-medium px-1">Scopes</legend>
            <div className="grid grid-cols-2 gap-1">
              {SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={(e) =>
                      setScopes((prev) => (e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)))
                    }
                  />
                  <code>{scope}</code>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="text-xs font-medium" htmlFor={`token-expiry-${agentId}`}>Expires in (days)</label>
          <input
            id={`token-expiry-${agentId}`}
            type="number"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder="90"
            className="bg-transparent border rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          {/* Says the default rather than pre-filling it, so the form does not
              imply the user chose 90 when they did not. */}
          <p className="text-xs text-muted-foreground">Leave blank for 90 days. Maximum 365.</p>

          {createMutation.isError && (
            <p className="text-xs text-destructive">
              Failed to create token: {(createMutation.error as Error).message}
            </p>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending || !name.trim() || scopes.length === 0}
            className="self-end px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium disabled:bg-muted disabled:text-muted-foreground"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      {revokeMutation.isError && (
        <p className="text-xs text-destructive mb-2">
          Failed to revoke token: {(revokeMutation.error as Error).message}
        </p>
      )}

      {tokensQuery.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tokens for this agent.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tokensQuery.data.map((t) => {
            const state = t.revokedAt ? 'revoked' : t.expired ? 'expired' : 'active';
            return (
              <li key={t.id} className="flex items-center gap-2 text-xs p-2 border rounded-md bg-card">
                <code className="text-muted-foreground">{t.tokenPrefix}…</code>
                <span className="flex-1 truncate">{t.name}</span>
                <span className={state === 'active' ? 'text-success' : 'text-muted-foreground'}>{state}</span>
                <span className="text-muted-foreground w-32 text-right">
                  {state === 'active' ? relativeDays(t.expiresAt) : '—'}
                </span>
                {state === 'active' && (
                  <button
                    aria-label={`Revoke token ${t.name}`}
                    onClick={async () => {
                      if (await confirm({
                        title: `Revoke "${t.name}"?`,
                        consequence: 'Anything using this token stops working immediately.',
                        undo: null,
                        confirmLabel: 'Revoke token',
                      })) {
                        revokeMutation.mutate(t.id);
                      }
                    }}
                    disabled={revokeMutation.isPending}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
      <span className="sr-only">Tokens for {agentName}</span>
    </div>
  );
}
