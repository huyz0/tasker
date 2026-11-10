import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { AgentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { formatDateTime } from '../../lib/format';
import { IssuedCredential } from './IssuedCredential';
import type { IssuedIdentity } from '../../lib/agentCredential';

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
  // M21 added the memory scopes to the backend vocabulary and never here, so
  // until M26 an operator could not grant them from this screen at all. The
  // list is a hand-maintained mirror of `scopes.ts`'s AGENT_SCOPES; keep them
  // in step.
  'memory:read',
  'memory:write',
  // M26-T02 (ADR-0023): opens the live event feed. What the token then
  // *receives* is still narrowed by the read scopes above it.
  'events:read',
];

const relativeDays = (iso: string): string => {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days === 0) return 'expires today';
  return `expires in ${days} day${days === 1 ? '' : 's'}`;
};

// ADR-0008: 365 days is a hard maximum, not a suggestion - "no expiry" is the
// option the decision deliberately removed. The backend already rejects
// anything past it; this just says so before the round trip instead of after.
const MAX_EXPIRY_DAYS = 365;

function expiryError(raw: string): string | null {
  if (raw.trim() === '') return null;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1) return 'Must be a whole number of days.';
  if (days > MAX_EXPIRY_DAYS) return `Cannot exceed ${MAX_EXPIRY_DAYS} days.`;
  return null;
}

// Remember known administration loss for the confirmed account/org across
// panel changes. Only an actual non-canceled read can issue a current receipt.
const administrationEpochs = new WeakMap<QueryClient, Map<string, { epoch: number }>>();
function administrationLifetime(client: QueryClient, accountId: string, orgId: string) {
  let scopes = administrationEpochs.get(client);
  if (!scopes) { scopes = new Map(); administrationEpochs.set(client, scopes); }
  const key = JSON.stringify([accountId, orgId]);
  let state = scopes.get(key);
  if (!state) { state = { epoch: 0 }; scopes.set(key, state); }
  return state;
}

interface Props { agentId: string; agentName: string; accountId: string; orgId: string; projectId?: string; }
interface IssueVariables { name: string; scopes: string[]; expiresInDays: number; revision: number; epoch: number; }
type Credential = IssuedIdentity & { plaintext: string; focusOnReveal: boolean; epoch: number };

export function AgentTokens(props: Props) {
  return <ScopedAgentTokens key={JSON.stringify([props.accountId, props.orgId, props.agentId])} {...props} />;
}

function ScopedAgentTokens({ agentId, agentName, accountId, orgId, projectId }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const administration = administrationLifetime(queryClient, accountId, orgId);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState('');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [notice, setNotice] = useState('');
  const issuanceForm = useRef<HTMLFormElement>(null);
  const newTokenButton = useRef<HTMLButtonElement>(null);
  const tokenPanel = useRef<HTMLDivElement>(null);
  const revokeOrigin = useRef<HTMLButtonElement | null>(null);
  const intent = useRef({ active: true, revision: 0 });
  useEffect(() => {
    intent.current.active = true;
    return () => { intent.current.active = false; intent.current.revision++; };
  }, []);
  const retire = () => { intent.current.revision++; setCredential(null); };
  const tokensQuery = useQuery({
    queryKey: ['agentTokens', agentId, orgId, accountId], retry: false,
    queryFn: async ({ signal }) => {
      const epoch = administration.epoch;
      try {
        const response = await agentClient.listAgentTokens({ agentId }, { signal });
        if (signal.aborted || epoch !== administration.epoch) throw new Error('Token administration requires a fresh read.');
        return { tokens: response.tokens, epoch };
      } catch (error) {
        if (!signal.aborted && epoch === administration.epoch && error instanceof ConnectError && (error.code === Code.PermissionDenied || error.code === Code.Unauthenticated)) administration.epoch++;
        throw error;
      }
    },
  });
  const createMutation = useMutation({
    gcTime: 0,
    mutationFn: async (variables: IssueVariables) => {
      const response = await agentClient.createAgentToken({ agentId, name: variables.name, scopes: variables.scopes, expiresInDays: variables.expiresInDays });
      if (!intent.current.active || intent.current.revision !== variables.revision || administration.epoch !== variables.epoch) return;
      const token = response.token;
      if (!token?.id || !response.plaintext || token.agentId !== agentId || token.orgId !== orgId || token.scopes.length !== variables.scopes.length || [...token.scopes].sort().some((scope, index) => scope !== [...variables.scopes].sort()[index])) throw new Error('Could not confirm the issued token. Refresh the token list and revoke any unusable token.');
      setCredential({ epoch: variables.epoch, focusOnReveal: document.activeElement === document.body || !!issuanceForm.current?.contains(document.activeElement), plaintext: response.plaintext, tokenId: token.id, agentId, orgId, scopes: [...token.scopes] });
      setName(''); setScopes([]); setExpiresInDays(''); setIsCreating(false); setNotice('');
      // The mutation resolves without the response: its cache never receives a secret.
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['agentTokens', agentId, orgId, accountId] }); },
  });
  const revokeMutation = useMutation({
    gcTime: 0,
    mutationFn: async (tokenId: string) => { await agentClient.revokeAgentToken({ tokenId }); return tokenId; },
    onSuccess: tokenId => {
      const focused = document.activeElement;
      const retiredSection = tokenPanel.current?.querySelector('[aria-label="Newly issued credential"]');
      const returnFocus = intent.current.active && (focused === document.body || focused === revokeOrigin.current || (credential?.tokenId === tokenId && retiredSection?.contains(focused)));
      void queryClient.invalidateQueries({ queryKey: ['agentTokens', agentId, orgId, accountId] });
      if (intent.current.active && credential?.tokenId === tokenId) { retire(); setNotice('Token revoked. Issue a replacement to reconnect the worker.'); }
      if (returnFocus) newTokenButton.current?.focus();
    },
    onSettled: () => { revokeOrigin.current = null; },
  });
  const administrationDenied = administration.epoch > 0 && tokensQuery.data?.epoch !== administration.epoch;
  const authorized = tokensQuery.data?.epoch === administration.epoch;
  const tokens = tokensQuery.data?.tokens ?? [];
  const credentialRetired = credential && credential.epoch !== administration.epoch;
  const knownUnavailable = credential && tokens.some(token => token.id === credential.tokenId && (token.revokedAt || token.expired));
  useEffect(() => {
    if (administrationDenied || knownUnavailable || credentialRetired) {
      intent.current.revision++; setCredential(null); createMutation.reset();
      if (knownUnavailable) setNotice('Token revoked or expired. Issue a replacement to reconnect the worker.');
    }
  }, [administrationDenied, knownUnavailable, credentialRetired]);

  if (!authorized) return tokensQuery.isLoading
    ? <p role="status" className="p-3 type-caption text-muted-foreground">Loading tokens…</p>
    : <div className="flex flex-col items-start gap-2 p-3">
      <p role="alert" className="type-caption text-muted-foreground">Token administration is unavailable. An authorized administrator can manage tokens; check your access or retry.</p>
      <button type="button" className="type-caption text-primary underline underline-offset-2" onClick={() => void tokensQuery.refetch()}>Retry tokens</button>
    </div>;

  return (
    <div ref={tokenPanel} className="p-3 bg-muted/20 border-t">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium">Tokens</h3>
        <button
          ref={newTokenButton}
          onClick={() => { retire(); createMutation.reset(); setIsCreating(value => !value); }}
          className="text-xs px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium"
        >
          {isCreating ? 'Cancel' : 'New token'}
        </button>
      </div>

      {tokensQuery.isError && <div role="alert" className="mb-3 flex flex-col items-start gap-2 type-caption text-muted-foreground">
        <p>Could not refresh token metadata.{credential ? ' Your one-time token is still available.' : ''} Retry when connected.</p>
        <button type="button" className="text-primary underline underline-offset-2" onClick={() => void tokensQuery.refetch()}>Retry tokens</button>
      </div>}
      {notice && <p role="status" className="mb-3 type-caption text-muted-foreground">{notice}</p>}
      {credential && !knownUnavailable && !credentialRetired && <IssuedCredential key={credential.tokenId} credential={credential} projectId={projectId} focusOnReveal={credential.focusOnReveal} onVerified={() => { void queryClient.invalidateQueries({ queryKey: ['agentTokens', agentId, orgId, accountId] }); void queryClient.invalidateQueries({ queryKey: ['dashboard', orgId] }); }} onDismiss={() => { retire(); createMutation.reset(); setNotice('Lost this token? Revoke it and issue a replacement; its secret cannot be recovered.'); newTokenButton.current?.focus(); }} />}

      {isCreating && (
        <form
          ref={issuanceForm}
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ name: name.trim(), scopes: [...scopes], expiresInDays: expiresInDays ? Number(expiresInDays) : 0, revision: intent.current.revision, epoch: administration.epoch }); }}
          className="mb-3 p-3 border rounded-md flex flex-col gap-2 bg-card"
        >
          <label className="text-xs font-medium" htmlFor={`token-name-${agentId}`}>Name</label>
          <input
            id={`token-name-${agentId}`}
            disabled={createMutation.isPending}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CI worker"
            className="bg-transparent border rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />

          <fieldset className="border rounded-md p-2">
            <legend className="text-xs font-medium px-1">Scopes</legend>
            <p className="mb-2 type-caption text-muted-foreground">Choose only what this worker needs. Role capabilities do not grant API access.</p>
            <div className="grid grid-cols-2 gap-1">
              {SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-xs">
                  <input
                    disabled={createMutation.isPending}
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
            disabled={createMutation.isPending}
            type="number"
            min={1}
            max={MAX_EXPIRY_DAYS}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder="90"
            aria-invalid={expiryError(expiresInDays) !== null}
            className="bg-transparent border rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          {/* Says the default rather than pre-filling it, so the form does not
              imply the user chose 90 when they did not. */}
          <p className="text-xs text-muted-foreground">Leave blank for 90 days. Maximum {MAX_EXPIRY_DAYS}.</p>
          {expiryError(expiresInDays) && (
            <p className="text-xs text-destructive-subtle-foreground">{expiryError(expiresInDays)}</p>
          )}

          {createMutation.isError && (
            <p className="text-xs text-destructive-subtle-foreground">
              Failed to create token: Token issuance was refused or unavailable. Check your access and retry.
            </p>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending || !name.trim() || scopes.length === 0 || expiryError(expiresInDays) !== null}
            className="self-end px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium disabled:bg-muted disabled:text-muted-foreground"
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {revokeMutation.isError && (
        <p className="text-xs text-destructive-subtle-foreground mb-2">
          Failed to revoke token: {(revokeMutation.error as Error).message}
        </p>
      )}

      {tokens.length > 0 && <p className="my-3 type-caption text-muted-foreground">Secrets cannot be recovered. If you lose a token, revoke it and issue a replacement.</p>}
      {tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tokens for this agent.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tokens.map((t) => {
            const state = t.revokedAt ? 'revoked' : t.expired ? 'expired' : 'active';
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs p-2 border rounded-md bg-card">
                <code className="text-muted-foreground">{t.tokenPrefix}…</code>
                <span className="flex-1 truncate">{t.name}</span>
                <span className={state === 'active' ? 'text-success' : 'text-muted-foreground'}>{state}</span>
                <span className="shrink-0 whitespace-nowrap text-right text-muted-foreground">
                  {t.lastUsedAt
                    ? <>used <time dateTime={t.lastUsedAt}>{formatDateTime(t.lastUsedAt)}</time></>
                    : 'never used'}
                </span>
                <span className="text-muted-foreground w-32 text-right">
                  {state === 'active' ? relativeDays(t.expiresAt) : '—'}
                </span>
                {state === 'active' && (
                  <button
                    aria-label={`Revoke token ${t.name}`}
                    onClick={async event => {
                      const origin = event.currentTarget;
                      const revision = intent.current.revision;
                      if (await confirm({
                        title: `Revoke "${t.name}"?`,
                        consequence: 'Anything using this token stops working immediately.',
                        undo: null,
                        confirmLabel: 'Revoke token',
                      })) {
                        if (intent.current.active && revision === intent.current.revision) { revokeOrigin.current = origin; revokeMutation.mutate(t.id); }
                      }
                    }}
                    disabled={revokeMutation.isPending}
                    className="text-muted-foreground hover:text-destructive-subtle-foreground disabled:opacity-50"
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
