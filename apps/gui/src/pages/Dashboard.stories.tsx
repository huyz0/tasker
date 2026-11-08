import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import { useLayoutStore } from '../store/layout';

function DashboardPreview({ state }: { state: 'no-org' | 'empty' | 'loading' | 'error' | 'populated' }) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false } } });
    const queryKey = ['dashboard', 'org-storybook', ''];
    if (state === 'loading' || state === 'error') {
      void q.fetchQuery({ queryKey, queryFn: () => state === 'loading' ? new Promise<never>(() => {}) : Promise.reject(new Error('Permission denied. Ask your workspace administrator for access.')) }).catch(() => undefined);
    } else {
      q.setQueryData(queryKey, { awaitingReview: [], awaitingReviewCount: 0n, disagreements: [], disagreementCount: 0n,
        agents: state === 'populated' ? Array.from({ length: 6 }, (_, i) => ({ id: `agent-${i}`, name: `Release agent ${i + 1}`, openTaskCount: 1n, lastUsedAt: new Date().toISOString() })) : [], recentActivity: [] });
    }
    return q;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId, activePageTitle } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: state === 'no-org' ? '' : 'org-storybook', activeProjectId: '' });
    setReady(true);
    return () => { useLayoutStore.setState({ activeOrgId, activeProjectId, activePageTitle }); };
  }, [state]);
  return ready ? <QueryClientProvider client={client}><Dashboard /></QueryClientProvider> : null;
}

const meta = {
  title: 'Pages/Dashboard', component: Dashboard,
  parameters: { layout: 'padded', docs: { description: { component: 'Empty summaries stay compact beside populated activity. Synthetic cache fixtures cover each screen state without backend credentials.' } } },
} satisfies Meta<typeof Dashboard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoOrgSelected: Story = { render: () => <DashboardPreview state="no-org" /> };
export const Empty: Story = { render: () => <DashboardPreview state="empty" /> };
export const Loading: Story = { render: () => <DashboardPreview state="loading" /> };
export const PermissionDenied: Story = { render: () => <DashboardPreview state="error" /> };
export const WithOrgSelected: Story = { render: () => <DashboardPreview state="populated" /> };
