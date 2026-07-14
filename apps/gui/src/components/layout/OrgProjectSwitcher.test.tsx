import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListOrgs, mockListProjects } = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockListProjects: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'ProjectService') return { listProjects: mockListProjects };
    return { listOrgs: mockListOrgs };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  OrgService: 'OrgService',
  ProjectService: 'ProjectService',
}));

let mockActiveOrgId = '';
let mockActiveProjectId = '';
const mockSetActiveOrgId = vi.fn((id: string) => { mockActiveOrgId = id; });
const mockSetActiveProjectId = vi.fn((id: string) => { mockActiveProjectId = id; });
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
    setActiveOrgId: mockSetActiveOrgId,
    setActiveProjectId: mockSetActiveProjectId,
  })),
}));

import { OrgProjectSwitcher } from './OrgProjectSwitcher';

function renderSwitcher() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrgProjectSwitcher />
    </QueryClientProvider>
  );
}

describe('OrgProjectSwitcher', () => {
  beforeEach(() => {
    mockActiveOrgId = '';
    mockActiveProjectId = '';
    mockListOrgs.mockReset();
    mockListProjects.mockReset();
    mockSetActiveOrgId.mockReset();
    mockSetActiveProjectId.mockReset();
  });

  it('auto-selects the first org when none is active', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    mockListProjects.mockResolvedValue({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-1'));
  });

  it('auto-selects the first project once an org is active', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Project One' }] });

    renderSwitcher();

    await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-1'));
  });

  it('auto-loads later pages so orgs and projects past the first page are selectable', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs
      .mockResolvedValueOnce({ organizations: [{ id: 'org-1', name: 'Page One Org', slug: 'page-one' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ organizations: [{ id: 'org-2', name: 'Page Two Org', slug: 'page-two' }], page: {} });
    mockListProjects
      .mockResolvedValueOnce({ projects: [{ id: 'proj-1', name: 'Page One Project' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ projects: [{ id: 'proj-2', name: 'Page Two Project' }], page: {} });

    renderSwitcher();

    await waitFor(() => expect(screen.getByText('Page Two Org')).toBeDefined());
    expect(screen.getByText('Page One Org')).toBeDefined();
    expect(mockListOrgs).toHaveBeenCalledWith({ page: { cursor: 'cursor-2' } });

    await waitFor(() => expect(screen.getByText('Page Two Project')).toBeDefined());
    expect(screen.getByText('Page One Project')).toBeDefined();
    expect(mockListProjects).toHaveBeenCalledWith({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });

  it('lets the user switch the active organization', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-1', name: 'Org One', slug: 'org-one' },
        { id: 'org-2', name: 'Org Two', slug: 'org-two' },
      ],
    });
    mockListProjects.mockResolvedValue({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(screen.getByText('Org Two')).toBeDefined());
    const orgSelect = screen.getByLabelText('Active organization');
    fireEvent.change(orgSelect, { target: { value: 'org-2' } });

    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-2');
  });

  it('lets the user switch the active project', async () => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    mockListProjects.mockResolvedValue({
      projects: [
        { id: 'proj-1', name: 'Project One' },
        { id: 'proj-2', name: 'Project Two' },
      ],
    });

    renderSwitcher();

    await waitFor(() => expect(screen.getByText('Project Two')).toBeDefined());
    const projectSelect = screen.getByLabelText('Active project');
    fireEvent.change(projectSelect, { target: { value: 'proj-2' } });

    expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-2');
  });
});
