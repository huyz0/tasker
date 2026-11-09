import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useScopeSync } from '../../hooks/useScope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrgProjectSwitcher } from './OrgProjectSwitcher';
import { useLayoutStore } from '../../store/layout';

// OrgProjectSwitcher owns two real createClient(...) calls (OrgService,
// ProjectService). No global QueryClientProvider decorator exists in
// .storybook/preview.tsx and no MSW is wired in, so - the same documented
// gap as Memory/Handoffs' own stories - this is the real loading state
// against an unreachable-in-Storybook backend, not a mocked populated one.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Layout/OrgProjectSwitcher',
  component: OrgProjectSwitcher,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-xs">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof OrgProjectSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
      return <Story />;
    },
  ],
};

function ScopedSwitcher() { useScopeSync(); return <OrgProjectSwitcher />; }

function ProjectlessMemoryPreview({ outsidePage = false }: { outsidePage?: boolean }) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false } } });
    cache.setQueryData(['orgs', 'switcher', ''], { orgs: [{ id: 'org-story', name: 'Product workspace' }], total: 1 });
    cache.setQueryData(['projects', 'switcher', outsidePage ? 'org-owner-outside-page' : 'org-story', ''], { projects: [{ id: 'project-story', name: 'Release' }], total: 1 });
    return cache;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: outsidePage ? 'org-owner-outside-page' : 'org-story', activeProjectId: outsidePage ? 'project-owner-outside-page' : '' });
    setReady(true);
    return () => useLayoutStore.setState({ activeOrgId, activeProjectId });
  }, [outsidePage]);
  return ready ? <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[outsidePage ? '/tasks/task-owner?org=org-owner-outside-page&project=project-owner-outside-page' : '/memory/belief-story?org=org-story&scope=organization']}>
      <ScopedSwitcher />
    </MemoryRouter>
  </QueryClientProvider> : null;
}

export const ProjectlessMemory: Story = {
  parameters: { router: false },
  render: () => <ProjectlessMemoryPreview />,
};

/** Names outside the loaded page stay honest until an authorized name is available. */
export const OwnerOutsideLoadedPage: Story = {
  parameters: { router: false },
  render: () => <ProjectlessMemoryPreview outsidePage />,
};
