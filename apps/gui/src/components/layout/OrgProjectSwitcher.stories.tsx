import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
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

function ScopedSwitcher({ memoryLink = false }: { memoryLink?: boolean }) { useScopeSync(); return <><OrgProjectSwitcher />{memoryLink && <Link to="/memory?org=org-story&scope=organization">Open organization memory</Link>}</>; }

function ProjectlessMemoryPreview({ outsidePage = false, attention = false, selectedProject = false, memoryLink = false }: { outsidePage?: boolean; attention?: boolean; selectedProject?: boolean; memoryLink?: boolean }) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false } } });
    cache.setQueryData(['orgs', 'switcher', ''], { orgs: [{ id: 'org-story', name: 'Product workspace' }], total: 1 });
    cache.setQueryData(['projects', 'switcher', outsidePage ? 'org-owner-outside-page' : 'org-story', ''], { projects: [{ id: 'project-story', name: 'Release' }], total: 1 });
    return cache;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: outsidePage ? 'org-owner-outside-page' : 'org-story', activeProjectId: outsidePage ? 'project-owner-outside-page' : selectedProject ? 'project-story' : '' });
    setReady(true);
    return () => useLayoutStore.setState({ activeOrgId, activeProjectId });
  }, [outsidePage, selectedProject]);
  return ready ? <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[attention ? `/attention?org=org-story${selectedProject ? '&project=project-story' : ''}` : outsidePage ? '/tasks/task-owner?org=org-owner-outside-page&project=project-owner-outside-page' : '/memory/belief-story?org=org-story&scope=organization']}>
      <ScopedSwitcher memoryLink={memoryLink} />
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

export const AttentionAllProjects: Story = {
  parameters: { router: false }, render: () => <ProjectlessMemoryPreview attention />,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Active project' })).resolves.toHaveTextContent('All projects'); },
};
export const AttentionSelectedProject: Story = {
  parameters: { router: false }, render: () => <ProjectlessMemoryPreview attention selectedProject />,
  play: async ({ canvasElement }) => { const button = await within(canvasElement).findByRole('button', { name: 'Active project' }); await waitFor(() => expect(button).toHaveTextContent('Release')); },
};
export const AttentionChoices: Story = {
  parameters: { router: false }, render: () => <ProjectlessMemoryPreview attention />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Active project' }));
    await expect(canvas.findByRole('option', { name: 'All projects' })).resolves.toBeVisible();
    await expect(canvas.findByRole('option', { name: 'Release' })).resolves.toBeVisible();
  },
};

export const AttentionToOrganizationMemory: Story = {
  parameters: { router: false }, render: () => <ProjectlessMemoryPreview attention selectedProject memoryLink />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), button = await canvas.findByRole('button', { name: 'Active project' });
    await waitFor(() => expect(button).toHaveTextContent('Release'));
    await userEvent.click(button); await userEvent.click(await canvas.findByRole('option', { name: 'All projects' }));
    await userEvent.click(canvas.getByRole('link', { name: 'Open organization memory' }));
    await waitFor(() => expect(button).toHaveTextContent('Select project'));
  },
};
