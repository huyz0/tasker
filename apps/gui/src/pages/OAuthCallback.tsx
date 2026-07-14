import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../lib/connectTransport";
import { reportError } from "../lib/errorReporter";
import { RepositoryService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const repositoryClient = createClient(RepositoryService, transport);

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Consumes the one-time nonce and fires a one-time OAuth token exchange -
  // not idempotent, so it must run at most once per real callback even
  // though StrictMode double-invokes effects in development (mount ->
  // cleanup -> mount, on the same instance, so this ref survives both).
  // Without this guard the second invocation finds the nonce already
  // deleted by the first, misreports a nonce mismatch, and re-submits the
  // one-time oauthCode to the backend a second time.
  const hasRunRef = useRef(false);

  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');

  const mutation = useMutation({
    mutationFn: async ({ projectId, provider, remoteName, oauthCode }: any) => {
      const resp = await repositoryClient.addRepositoryLink({
        projectId,
        provider,
        remoteName,
        oauthCode,
      });
      return resp.link;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['repositoryLinks', data?.projectId] });
      navigate('/projects');
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    if (!code) {
      setError("No authorization code found in URL.");
      return;
    }
    
    if (!stateRaw) {
      setError("No state parameter found. Cannot determine project to link.");
      return;
    }

    try {
      const state = JSON.parse(atob(stateRaw));

      // Verify this tab is the one that actually started the flow (login
      // CSRF protection) before storing an OAuth-derived credential.
      const expectedNonce = sessionStorage.getItem('repoLinkOauthNonce');
      sessionStorage.removeItem('repoLinkOauthNonce');
      if (!state.nonce || !expectedNonce || state.nonce !== expectedNonce) {
        setError("This authorization link doesn't match a repository link you started in this browser tab.");
        return;
      }

      mutation.mutate({
        projectId: state.projectId,
        provider: state.provider,
        remoteName: state.remoteName,
        oauthCode: code,
      });
    } catch (e) {
      reportError({ message: 'Failed to parse OAuth state parameter', err: e, severity: 'error' });
      setError("Invalid state parameter.");
    }
  }, []);

  if (error) {
    return (
      <div className="p-8 max-w-md mx-auto mt-10 border rounded-lg bg-destructive/10 text-destructive border-destructive/20 text-center">
        <h2 className="text-lg font-bold mb-2">Integration Failed</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/projects')} className="mt-4 px-4 py-2 bg-background border rounded hover:bg-muted text-foreground">Return to Projects</button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-md mx-auto mt-10 text-center">
      <h2 className="text-xl font-bold mb-2 text-primary">Linking Repository...</h2>
      <p className="text-muted-foreground mb-4">Please wait while we complete the integration with your provider.</p>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
    </div>
  );
}
