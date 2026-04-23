import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { RepositoryService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const repositoryClient = createClient(RepositoryService, transport);

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

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
      mutation.mutate({
        projectId: state.projectId,
        provider: state.provider,
        remoteName: state.remoteName,
        oauthCode: code,
      });
    } catch (e) {
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
