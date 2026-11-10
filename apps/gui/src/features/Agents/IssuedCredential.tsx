import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BACKEND_URL } from '../../lib/backendUrl';
import { verifyAgentCredential, workerConfiguration, type IssuedIdentity } from '../../lib/agentCredential';
import { formatDateTime } from '../../lib/format';
import { Button } from '../../components/ui/button';

interface Props { credential: IssuedIdentity & { plaintext: string }; projectId?: string; onDismiss: () => void; onVerified: () => void; focusOnReveal: boolean; }
export function IssuedCredential({ credential, projectId, onDismiss, onVerified, focusOnReveal }: Props) {
  const [format, setFormat] = useState<'shell' | 'mcp'>('shell');
  const [copyStatus, setCopyStatus] = useState('');
  const lifetime = useRef({ active: true, copy: 0 });
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusOnReveal) heading.current?.focus(); }, [focusOnReveal]);
  useEffect(() => {
    lifetime.current.active = true;
    return () => { lifetime.current.active = false; lifetime.current.copy++; request.current?.abort(); };
  }, []);
  const verification = useMutation({
    gcTime: 0,
    onSuccess: onVerified,
    mutationFn: async () => {
      request.current?.abort();
      const controller = new AbortController(); request.current = controller;
      return verifyAgentCredential(credential.plaintext, credential, controller.signal);
    },
  });
  const configuration = (token: string) => workerConfiguration(format, { endpoint: BACKEND_URL, orgId: credential.orgId, projectId }, token);
  const copy = async (configurationCopy: boolean) => {
    const current = ++lifetime.current.copy;
    try {
      await navigator.clipboard.writeText(configurationCopy ? configuration(credential.plaintext) : credential.plaintext);
      if (lifetime.current.active && current === lifetime.current.copy) setCopyStatus(configurationCopy ? 'Configuration copied, including the secret token.' : 'Token copied.');
    } catch {
      if (lifetime.current.active && current === lifetime.current.copy) setCopyStatus('Could not copy automatically — select the token below or retry Copy.');
    }
  };
  return <section className="flex flex-col gap-4 rounded-md border bg-card p-3" aria-label="Newly issued credential">
    <div className="flex flex-col gap-2">
      <h4 ref={heading} tabIndex={-1} className="type-section-title rounded-sm focus-visible:outline-2 focus-visible:outline-primary">Save this token</h4>
      <p className="type-caption text-muted-foreground">This is the only time this token will be shown. Leaving or dismissing this section loses this copy. Save it securely; lost tokens must be revoked and replaced.</p>
      <code className="block break-all rounded-md bg-muted p-3 type-caption select-all">{credential.plaintext}</code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void copy(false)}>Copy token</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>I've saved it</Button>
      </div>
      <p role="status" className="type-caption text-muted-foreground">{copyStatus || 'Token ready. Copy only when you choose.'}</p>
    </div>
    <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
      <h4 className="type-section-title">Configure your worker</h4>
      <p className="type-caption text-muted-foreground">Install the Tasker CLI in your own environment. The worker must be able to reach this API. Copying configuration does not start or configure the worker for you.</p>
      <label className="type-caption font-medium" htmlFor={`worker-format-${credential.tokenId}`}>Configuration format</label>
      <select id={`worker-format-${credential.tokenId}`} value={format} onChange={event => setFormat(event.target.value as 'shell' | 'mcp')}
        className="self-start rounded-md border bg-background px-3 py-2 text-sm">
        <option value="shell">Shell</option><option value="mcp">MCP stdio</option>
      </select>
      <pre aria-label="Worker configuration" tabIndex={0} className="max-w-full overflow-x-auto rounded-md bg-muted p-3 type-caption"><code>{configuration('<TOKEN>')}</code></pre>
      <p className="type-caption text-muted-foreground">The preview uses a placeholder. Copy configuration includes this secret token.</p>
      <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => void copy(true)}>Copy configuration</Button>
    </div>
    <div className="flex flex-col gap-2 border-t pt-3">
      <h4 className="type-section-title">Verify this credential</h4>
      <p className="type-caption text-muted-foreground">This makes one API authentication request. It does not prove the external worker is running. This request also updates the token's recorded last use.</p>
      <Button type="button" size="sm" className="self-start" disabled={verification.isPending} onClick={() => { verification.reset(); verification.mutate(); }}>{verification.isPending ? 'Verifying…' : 'Verify token'}</Button>
      <div role="status" className="type-caption">
        {verification.isPending && <p>Checking this token with the API…</p>}
        {verification.isError && <p className="text-destructive-subtle-foreground">{verification.error.message}</p>}
        {verification.isSuccess && <div className="flex flex-col gap-1 text-success-subtle-foreground">
          <p>Token verified at <time dateTime={verification.data.verifiedAt}>{formatDateTime(verification.data.verifiedAt)}</time></p>
          <p className="break-words">Agent: {verification.data.name} ({verification.data.agentId})</p>
          <p className="break-words">Organization: {verification.data.orgId}</p>
          <p className="break-words">Scopes: {verification.data.scopes.join(', ')}</p>
        </div>}
      </div>
    </div>
  </section>;
}
