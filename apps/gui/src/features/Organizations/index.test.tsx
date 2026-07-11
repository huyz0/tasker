import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrganizationsDashboard } from './index';

const { mockListOrgs, mockSeedOrg, mockArchiveOrg, mockSetOrgRetentionDays } = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockSeedOrg: vi.fn(),
  mockArchiveOrg: vi.fn(),
  mockSetOrgRetentionDays: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ listOrgs: mockListOrgs, seedOrg: mockSeedOrg, archiveOrg: mockArchiveOrg, setOrgRetentionDays: mockSetOrgRetentionDays })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ OrgService: {} }));

let mockActiveOrgId = 'org-1';
const mockSetActiveOrgId = vi.fn((id: string) => { mockActiveOrgId = id; });
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeOrgId() { return mockActiveOrgId; },
    setActiveOrgId: mockSetActiveOrgId,
  })),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsDashboard />
    </QueryClientProvider>
  );
}

describe('OrganizationsDashboard', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockReset();
    mockSeedOrg.mockReset();
    mockArchiveOrg.mockReset();
    mockSetOrgRetentionDays.mockReset();
    mockSetActiveOrgId.mockReset();
  });

  it('renders the header correctly', () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    expect(screen.getByText('Organizations & Settings')).toBeDefined();
    expect(screen.getByText('Manage hierarchical organizational structure and teams.')).toBeDefined();
  });

  it('renders loading state for orgs', () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    expect(screen.getByText('Loading organizations...')).toBeDefined();
  });

  it('auto-selects the first real org when the current selection does not exist', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-real-1', name: 'Real Org', slug: 'real-org' }],
    });
    renderPage();

    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-real-1'));
  });

  it('does not re-select when the current org already exists in the list', async () => {
    mockActiveOrgId = 'org-real-1';
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-real-1', name: 'Real Org', slug: 'real-org' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Real Org')).toBeDefined());
    expect(mockSetActiveOrgId).not.toHaveBeenCalled();
  });

  it('creates a new organization via the form and selects it', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockSeedOrg.mockResolvedValue({ organization: { id: 'org-new', name: 'New Co', slug: 'new-co' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'New Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSeedOrg).toHaveBeenCalledWith({ name: 'New Co', slug: 'new-co' }));
    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-new'));
  });

  it('shows an error message when organization creation fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockSeedOrg.mockRejectedValue(new Error('slug already taken'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText(/Failed to create organization/)).toBeDefined());
  });

  it('creates a child org under a selected parent and renders it nested', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-root', name: 'Root Co', slug: 'root-co' }],
    });
    mockSeedOrg.mockResolvedValue({ organization: { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Child Co' } });
    fireEvent.change(screen.getByLabelText('Parent organization'), { target: { value: 'org-root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSeedOrg).toHaveBeenCalledWith({ name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' }));
  });

  it('renders child orgs nested beneath their parent', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    expect(screen.getByText('Child Co')).toBeDefined();
  });

  it('loads the next page of organizations when Load More is clicked', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs
      .mockResolvedValueOnce({ organizations: [{ id: 'org-1', name: 'Page One Org', slug: 'page-one' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ organizations: [{ id: 'org-2', name: 'Page Two Org', slug: 'page-two' }], page: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => expect(screen.getByText('Page Two Org')).toBeDefined());
    expect(mockListOrgs).toHaveBeenCalledWith({ page: { cursor: 'cursor-2' } });
    await waitFor(() => expect(screen.getByText('No more items to load')).toBeDefined());
  });

  it('shows and saves bin retention for the active org', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org', binRetentionDays: 45 }] });
    mockSetOrgRetentionDays.mockResolvedValue({ success: true });

    renderPage();

    const input = await screen.findByDisplayValue('45');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSetOrgRetentionDays).toHaveBeenCalledWith({ orgId: 'org-1', binRetentionDays: 10 }));
  });

  it('shows an error message when updating retention fails', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org' }] });
    mockSetOrgRetentionDays.mockRejectedValue(new Error('not an admin'));

    renderPage();

    const input = await screen.findByDisplayValue('30');
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Failed to update retention/)).toBeDefined());
  });
});
