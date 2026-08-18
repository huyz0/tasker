import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MemoryExplorer } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';
import { expectNoA11yViolations } from '../../test/a11y';

const {
  mockRecordBelief, mockGetBelief, mockListBeliefs, mockSearchBeliefs, mockUpdateBelief,
  mockSupersedeBelief, mockPromoteBelief, mockRelateBeliefs, mockUnrelateBeliefs,
  mockListBeliefRelations, mockListBeliefPromotions, mockArchiveBelief, mockRestoreBelief, mockPurgeBelief,
} = vi.hoisted(() => ({
  mockRecordBelief: vi.fn(),
  mockGetBelief: vi.fn(),
  mockListBeliefs: vi.fn(),
  mockSearchBeliefs: vi.fn(),
  mockUpdateBelief: vi.fn(),
  mockSupersedeBelief: vi.fn(),
  mockPromoteBelief: vi.fn(),
  mockRelateBeliefs: vi.fn(),
  mockUnrelateBeliefs: vi.fn(),
  mockListBeliefRelations: vi.fn(),
  mockListBeliefPromotions: vi.fn(),
  mockArchiveBelief: vi.fn(),
  mockRestoreBelief: vi.fn(),
  mockPurgeBelief: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    recordBelief: mockRecordBelief,
    getBelief: mockGetBelief,
    listBeliefs: mockListBeliefs,
    searchBeliefs: mockSearchBeliefs,
    updateBelief: mockUpdateBelief,
    supersedeBelief: mockSupersedeBelief,
    promoteBelief: mockPromoteBelief,
    relateBeliefs: mockRelateBeliefs,
    unrelateBeliefs: mockUnrelateBeliefs,
    listBeliefRelations: mockListBeliefRelations,
    listBeliefPromotions: mockListBeliefPromotions,
    archiveBelief: mockArchiveBelief,
    restoreBelief: mockRestoreBelief,
    purgeBelief: mockPurgeBelief,
  })),
}));

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  MemoryService: { name: 'MemoryService' },
}));

let mockActiveOrgId = 'org-1';
let mockActiveProjectId = 'proj-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
  })),
}));

const BELIEFS = [
  {
    id: 'blf-1', orgId: 'org-1', scopeType: 'project', scopeId: 'proj-1',
    statement: 'Tests must pass before merge', confidence: 'high', status: 'active',
    sourceKind: 'user', sourceUserId: 'user-1', createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'blf-2', orgId: 'org-1', scopeType: 'project', scopeId: 'proj-1',
    statement: 'CI always runs migrations against MySQL', confidence: 'medium', status: 'active',
    sourceKind: 'agent', sourceAgentId: 'agent-1', sourceTaskId: 'task-1', createdAt: '2026-01-02T00:00:00Z',
  },
];

function renderPage(initialEntry = '/memory') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/memory" element={<MemoryExplorer />} />
          <Route path="/memory/:beliefId" element={<MemoryExplorer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function searchFor(text: string) {
  fireEvent.change(screen.getByLabelText('Search beliefs'), { target: { value: text } });
  await screen.findByText(text === 'Tests' ? 'Tests must pass before merge' : text, { exact: false });
}

describe('MemoryExplorer', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    for (const m of [
      mockRecordBelief, mockGetBelief, mockListBeliefs, mockSearchBeliefs, mockUpdateBelief,
      mockSupersedeBelief, mockPromoteBelief, mockRelateBeliefs, mockUnrelateBeliefs,
      mockListBeliefRelations, mockListBeliefPromotions, mockArchiveBelief, mockRestoreBelief, mockPurgeBelief,
    ]) m.mockReset();

    mockSearchBeliefs.mockResolvedValue({ beliefs: BELIEFS });
    mockListBeliefs.mockResolvedValue({ beliefs: BELIEFS, page: {} });
    mockListBeliefRelations.mockResolvedValue({ relations: [] });
    mockListBeliefPromotions.mockResolvedValue({ promotions: [] });
    mockGetBelief.mockResolvedValue({ belief: BELIEFS[0] });
  });

  it('prompts for a project when none is selected', () => {
    mockActiveProjectId = '';
    renderPage();
    expect(screen.getByText(/Select a project/)).toBeInTheDocument();
    expect(mockSearchBeliefs).not.toHaveBeenCalled();
  });

  it('prompts for an organization when none is selected', () => {
    mockActiveOrgId = '';
    renderPage();
    expect(screen.getByText(/Select an organization/)).toBeInTheDocument();
  });

  it('finds matching beliefs as the caller types, scoped to the active project', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search beliefs'), { target: { value: 'Tests' } });
    await screen.findByText('Tests must pass before merge');

    await waitFor(() => expect(mockSearchBeliefs).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: 'project', scopeId: 'proj-1', query: 'Tests' }),
    ));
  });

  it('shows a selected belief’s statement, badges and provenance', async () => {
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    const detail = within(await screen.findByRole('region', { name: 'Belief detail' }));
    expect(detail.getByText('high confidence', { exact: false })).toBeInTheDocument();
    expect(detail.getByText(/Recorded by a person/)).toBeInTheDocument();
  });

  it('shows agent provenance and the linked task for an agent-recorded belief', async () => {
    renderPage();
    await searchFor('CI');
    fireEvent.click(screen.getByText('CI always runs migrations against MySQL'));

    const detail = within(await screen.findByRole('region', { name: 'Belief detail' }));
    expect(detail.getByText(/Recorded by an agent/)).toBeInTheDocument();
    expect(detail.getByText(/from task task-1/)).toBeInTheDocument();
  });

  it('records a new belief at the current scope', async () => {
    mockRecordBelief.mockResolvedValue({ belief: BELIEFS[0] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Record belief/ }));
    fireEvent.change(await screen.findByLabelText('Statement'), { target: { value: 'New fact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record belief' }));

    await waitFor(() => expect(mockRecordBelief).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', scopeType: 'project', scopeId: 'proj-1', statement: 'New fact', confidence: 'medium' }),
    ));
  });

  it('edits a belief’s statement and confidence inline', async () => {
    mockUpdateBelief.mockResolvedValue({ belief: { ...BELIEFS[0], statement: 'Updated', confidence: 'low' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByText('Edit'));
    const textarea = screen.getByLabelText('Statement');
    fireEvent.change(textarea, { target: { value: 'Updated' } });
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: 'low' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpdateBelief).toHaveBeenCalledWith({ id: 'blf-1', statement: 'Updated', confidence: 'low' }));
  });

  it('supersedes a belief and selects the replacement', async () => {
    mockSupersedeBelief.mockResolvedValue({ belief: { ...BELIEFS[0], id: 'blf-3', statement: 'Corrected statement' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Supersede'));
    const textarea = await screen.findByLabelText('New statement');
    fireEvent.change(textarea, { target: { value: 'Corrected statement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Supersede' }));

    await waitFor(() => expect(mockSupersedeBelief).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'blf-1', statement: 'Corrected statement' }),
    ));
  });

  it('promotes a project-scoped belief to organization scope after confirmation', async () => {
    mockPromoteBelief.mockResolvedValue({ belief: { ...BELIEFS[0], scopeType: 'organization', scopeId: 'org-1' }, promotion: { id: 'promo-1' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Promote'));
    fireEvent.click(await screen.findByRole('button', { name: 'Promote' }));
    await confirmAction();

    await waitFor(() => expect(mockPromoteBelief).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'blf-1', toScopeType: 'organization', toScopeId: 'org-1' }),
    ));
  });

  it('does not promote when confirmation is cancelled', async () => {
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Promote'));
    fireEvent.click(await screen.findByRole('button', { name: 'Promote' }));
    await cancelAction();

    expect(mockPromoteBelief).not.toHaveBeenCalled();
  });

  it('relates a belief found via the inline picker', async () => {
    // Only blf-1 matches the first search - unlike the shared `BELIEFS`
    // default, a query-aware mock so blf-2 isn't already on screen (from the
    // main search) by the time the picker's own "CI" search resolves it,
    // which would make the click below select it instead of relating it.
    mockSearchBeliefs.mockReset();
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[0]] });
    mockRelateBeliefs.mockResolvedValue({ relation: { id: 'rel-1', beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'relates_to', createdBy: 'user-1', createdAt: '' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByText('Relate another belief'));
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[1]] });
    fireEvent.change(screen.getByLabelText('Search beliefs to relate'), { target: { value: 'CI' } });
    fireEvent.click(await screen.findByText('CI always runs migrations against MySQL'));

    await waitFor(() => expect(mockRelateBeliefs).toHaveBeenCalledWith({ beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'relates_to' }));
  });

  it('removes an existing relation', async () => {
    mockListBeliefRelations.mockResolvedValue({
      relations: [{ id: 'rel-1', beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'relates_to', createdBy: 'user-1', createdAt: '' }],
    });
    mockUnrelateBeliefs.mockResolvedValue({ success: true });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByRole('button', { name: 'Remove relation' }));
    await waitFor(() => expect(mockUnrelateBeliefs).toHaveBeenCalledWith({ relationId: 'rel-1' }));
  });

  it('shows the promotion history tab', async () => {
    mockListBeliefPromotions.mockResolvedValue({
      promotions: [{ id: 'promo-1', beliefId: 'blf-1', fromScopeType: 'project', fromScopeId: 'proj-1', toScopeType: 'organization', toScopeId: 'org-1', promotedBy: 'user-1', promotedAt: '2026-01-03T00:00:00Z', note: 'widely useful' }],
    });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    // Radix's `Tabs.Trigger` (like `RowActionsMenu`'s Radix dropdown trigger
    // elsewhere in this file) activates on pointerdown, not a plain click.
    // Radix's `Tabs.Trigger` activates on mousedown, not click - unlike
    // `RowActionsMenu`'s Radix dropdown elsewhere in this file, which needs
    // pointerdown. Different Radix primitive, different activation event.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /History/ }), { button: 0 });

    await screen.findByText((_, el) => el?.textContent === 'project → organization');
    expect(screen.getByText(/widely useful/)).toBeInTheDocument();
  });

  it('archives a belief after confirmation', async () => {
    mockArchiveBelief.mockResolvedValue({ success: true });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveBelief).toHaveBeenCalledWith({ id: 'blf-1' }));
  });

  it('restores an archived belief and can then purge it', async () => {
    const archived = { ...BELIEFS[0], deletedAt: '2026-01-04T00:00:00Z' };
    mockSearchBeliefs.mockResolvedValue({ beliefs: [archived] });
    mockRestoreBelief.mockResolvedValue({ success: true });
    mockPurgeBelief.mockResolvedValue({ success: true });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    expect(await screen.findByText('Restore')).toBeInTheDocument();
    expect(screen.getByText('Delete permanently')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete permanently'));
    await confirmAction();

    await waitFor(() => expect(mockPurgeBelief).toHaveBeenCalledWith({ id: 'blf-1' }));
  });

  it('switches to browse-all mode and pages through listBeliefs', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Browse all' }));

    await waitFor(() => expect(mockListBeliefs).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: 'project', scopeId: 'proj-1' }),
    ));
    await screen.findByText('Tests must pass before merge');
  });

  it('switches to organization scope', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'organization' }));
    fireEvent.change(screen.getByLabelText('Search beliefs'), { target: { value: 'Tests' } });

    await waitFor(() => expect(mockSearchBeliefs).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: 'organization', scopeId: 'org-1' }),
    ));
  });

  it('resolves a belief reached via a direct link', async () => {
    mockGetBelief.mockResolvedValue({ belief: BELIEFS[1] });
    renderPage('/memory/blf-2');

    await screen.findByText('CI always runs migrations against MySQL');
    expect(mockGetBelief).toHaveBeenCalledWith({ id: 'blf-2' });
  });

  it('has no accessibility violations once populated', async () => {
    const { container } = renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    await screen.findByRole('region', { name: 'Belief detail' });

    await expectNoA11yViolations(container);
  });

  it('shows a retracted badge and every kind of secondary source link', async () => {
    mockSearchBeliefs.mockResolvedValue({
      beliefs: [{
        ...BELIEFS[1], status: 'retracted',
        sourceCommentId: 'cmt-1', sourceTaskNoteId: 'note-1', sourceArtifactId: 'art-1',
      }],
    });
    renderPage();
    await searchFor('CI');
    fireEvent.click(screen.getByText('CI always runs migrations against MySQL'));

    const detail = within(await screen.findByRole('region', { name: 'Belief detail' }));
    expect(detail.getByText('retracted')).toBeInTheDocument();
    expect(detail.getByText(/comment cmt-1/)).toBeInTheDocument();
    expect(detail.getByText(/note note-1/)).toBeInTheDocument();
    expect(detail.getByText(/artifact art-1/)).toBeInTheDocument();
  });

  it('records a belief with a non-default confidence', async () => {
    mockRecordBelief.mockResolvedValue({ belief: BELIEFS[0] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Record belief/ }));
    fireEvent.change(await screen.findByLabelText('Statement'), { target: { value: 'New fact' } });
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: 'low' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record belief' }));

    await waitFor(() => expect(mockRecordBelief).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 'low' }),
    ));
  });

  it('cancels an inline edit without saving', async () => {
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByText('Edit'));
    fireEvent.change(screen.getByLabelText('Statement'), { target: { value: 'Discarded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockUpdateBelief).not.toHaveBeenCalled();
    expect(screen.queryByText('Discarded')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Belief detail' })).getByText('Tests must pass before merge')).toBeInTheDocument();
  });

  it('picks a relation type other than the default', async () => {
    mockSearchBeliefs.mockReset();
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[0]] });
    mockRelateBeliefs.mockResolvedValue({ relation: { id: 'rel-1', beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'contradicts', createdBy: 'user-1', createdAt: '' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByText('Relate another belief'));
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[1]] });
    fireEvent.change(screen.getByLabelText('Search beliefs to relate'), { target: { value: 'CI' } });
    fireEvent.change(screen.getByLabelText('As'), { target: { value: 'contradicts' } });
    fireEvent.click(await screen.findByText('CI always runs migrations against MySQL'));

    await waitFor(() => expect(mockRelateBeliefs).toHaveBeenCalledWith({ beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'contradicts' }));
  });

  it('closes the relate picker via Done without picking anything', async () => {
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByText('Relate another belief'));
    await screen.findByLabelText('Search beliefs to relate');
    fireEvent.click(screen.getByText('Done'));

    expect(screen.queryByLabelText('Search beliefs to relate')).not.toBeInTheDocument();
    expect(mockRelateBeliefs).not.toHaveBeenCalled();
  });

  it('navigates to a related belief from the related list', async () => {
    mockListBeliefRelations.mockResolvedValue({
      relations: [{ id: 'rel-1', beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'relates_to', createdBy: 'user-1', createdAt: '' }],
    });
    mockGetBelief.mockResolvedValue({ belief: BELIEFS[1] });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.click(await screen.findByText('blf-2'));
    await waitFor(() => expect(mockGetBelief).toHaveBeenCalledWith({ id: 'blf-2' }));
  });

  it('restores an archived belief', async () => {
    const archived = { ...BELIEFS[0], deletedAt: '2026-01-04T00:00:00Z' };
    mockSearchBeliefs.mockResolvedValue({ beliefs: [archived] });
    mockRestoreBelief.mockResolvedValue({ success: true });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Restore'));

    await waitFor(() => expect(mockRestoreBelief).toHaveBeenCalledWith({ id: 'blf-1' }));
  });

  it('adds a note to a promotion', async () => {
    mockPromoteBelief.mockResolvedValue({ belief: { ...BELIEFS[0], scopeType: 'organization' }, promotion: { id: 'promo-1' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Promote'));
    fireEvent.change(await screen.findByLabelText(/Note/), { target: { value: 'Widely applicable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Promote' }));
    await confirmAction();

    await waitFor(() => expect(mockPromoteBelief).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Widely applicable' }),
    ));
  });

  it('filters by status and confidence in browse mode', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Browse all' }));
    await screen.findByText('Tests must pass before merge');

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'superseded' } });
    fireEvent.change(screen.getByLabelText('Filter by confidence'), { target: { value: 'high' } });

    await waitFor(() => expect(mockListBeliefs).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'superseded', confidence: 'high' }),
    ));
  });

  it('loads the next page of beliefs in browse mode', async () => {
    mockListBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[0]], page: { nextCursor: 'cursor-2' } });
    mockListBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[1]], page: {} });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Browse all' }));
    await screen.findByText('Tests must pass before merge');

    fireEvent.click(screen.getByRole('button', { name: 'Load more beliefs' }));

    await screen.findByText('CI always runs migrations against MySQL');
  });

  it('retries a failed search', async () => {
    mockSearchBeliefs.mockRejectedValueOnce(new Error('network down'));
    renderPage();
    fireEvent.change(screen.getByLabelText('Search beliefs'), { target: { value: 'Tests' } });
    await screen.findByText(/network down/);

    mockSearchBeliefs.mockResolvedValue({ beliefs: BELIEFS });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Tests must pass before merge');
  });

  it('surfaces a recordBelief mutation error', async () => {
    mockRecordBelief.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Record belief/ }));
    fireEvent.change(await screen.findByLabelText('Statement'), { target: { value: 'New fact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record belief' }));

    await screen.findByText(/Failed to record belief: boom/);
  });

  it('surfaces a supersedeBelief mutation error', async () => {
    mockSupersedeBelief.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Supersede'));
    fireEvent.change(await screen.findByLabelText('New statement'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Supersede' }));

    await screen.findByText(/Failed to supersede: boom/);
  });

  it('surfaces a relateBeliefs mutation error', async () => {
    mockSearchBeliefs.mockReset();
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[0]] });
    mockRelateBeliefs.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.click(await screen.findByText('Relate another belief'));
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[1]] });
    fireEvent.change(screen.getByLabelText('Search beliefs to relate'), { target: { value: 'CI' } });
    fireEvent.click(await screen.findByText('CI always runs migrations against MySQL'));

    await screen.findByText(/Failed to relate: boom/);
  });

  it('shows "No matching beliefs" when the relate picker finds nothing', async () => {
    mockSearchBeliefs.mockReset();
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [BELIEFS[0]] });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.click(await screen.findByText('Relate another belief'));
    mockSearchBeliefs.mockResolvedValueOnce({ beliefs: [] });
    fireEvent.change(screen.getByLabelText('Search beliefs to relate'), { target: { value: 'nothing' } });

    await screen.findByText('No matching beliefs.');
  });

  it('surfaces an unrelateBeliefs mutation error', async () => {
    mockListBeliefRelations.mockResolvedValue({
      relations: [{ id: 'rel-1', beliefAId: 'blf-1', beliefBId: 'blf-2', relationType: 'relates_to', createdBy: 'user-1', createdAt: '' }],
    });
    mockUnrelateBeliefs.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove relation' }));

    await screen.findByText(/Failed to remove relation: boom/);
  });

  it('retries a failed related-beliefs load', async () => {
    mockListBeliefRelations.mockRejectedValueOnce(new Error('down'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    await screen.findByText(/Could not load this list: down/);

    mockListBeliefRelations.mockResolvedValue({ relations: [] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);

    await screen.findByText('No related beliefs yet.');
  });

  it('retries a failed promotion history load', async () => {
    mockListBeliefPromotions.mockRejectedValueOnce(new Error('down'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /History/ }), { button: 0 });
    await screen.findByText(/Could not load this list: down/);

    mockListBeliefPromotions.mockResolvedValue({ promotions: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Never promoted.');
  });

  it('surfaces a promoteBelief mutation error', async () => {
    mockPromoteBelief.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Promote'));
    fireEvent.click(await screen.findByRole('button', { name: 'Promote' }));
    await confirmAction();

    await screen.findByText(/Failed to promote: boom/);
  });

  it('does not archive when confirmation is cancelled', async () => {
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await cancelAction();

    expect(mockArchiveBelief).not.toHaveBeenCalled();
  });

  it('surfaces an archiveBelief mutation error', async () => {
    mockArchiveBelief.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await confirmAction();

    await screen.findByText(/Failed to archive: boom/);
  });

  it('does not purge when confirmation is cancelled', async () => {
    const archived = { ...BELIEFS[0], deletedAt: '2026-01-04T00:00:00Z' };
    mockSearchBeliefs.mockResolvedValue({ beliefs: [archived] });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Delete permanently'));
    await cancelAction();

    expect(mockPurgeBelief).not.toHaveBeenCalled();
  });

  it('surfaces a purgeBelief mutation error', async () => {
    const archived = { ...BELIEFS[0], deletedAt: '2026-01-04T00:00:00Z' };
    mockSearchBeliefs.mockResolvedValue({ beliefs: [archived] });
    mockPurgeBelief.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Delete permanently'));
    await confirmAction();

    await screen.findByText(/Failed to delete: boom/);
  });

  it('surfaces a restoreBelief mutation error', async () => {
    const archived = { ...BELIEFS[0], deletedAt: '2026-01-04T00:00:00Z' };
    mockSearchBeliefs.mockResolvedValue({ beliefs: [archived] });
    mockRestoreBelief.mockRejectedValue(new Error('boom'));
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Restore'));

    await screen.findByText(/Failed to restore: boom/);
  });

  it('changes confidence while superseding', async () => {
    mockSupersedeBelief.mockResolvedValue({ belief: { ...BELIEFS[0], id: 'blf-3' } });
    renderPage();
    await searchFor('Tests');
    fireEvent.click(screen.getByText('Tests must pass before merge'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Belief actions' }), { button: 0 });
    fireEvent.click(await screen.findByText('Supersede'));
    fireEvent.change(await screen.findByLabelText('New statement'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: 'low' } });
    fireEvent.click(screen.getByRole('button', { name: 'Supersede' }));

    await waitFor(() => expect(mockSupersedeBelief).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 'low' }),
    ));
  });

  it('retries a failed browse-all load', async () => {
    mockListBeliefs.mockRejectedValueOnce(new Error('down'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Browse all' }));
    await screen.findByText(/Could not load this list: down/);

    mockListBeliefs.mockResolvedValue({ beliefs: BELIEFS, page: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Tests must pass before merge');
  });

  it('switches back to search mode from browse-all', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Browse all' }));
    await screen.findByText('Tests must pass before merge');

    fireEvent.click(screen.getByRole('button', { name: 'Back to search' }));

    expect(screen.getByLabelText('Search beliefs')).toBeInTheDocument();
  });
});
