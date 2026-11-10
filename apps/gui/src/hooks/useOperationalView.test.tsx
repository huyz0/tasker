import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useReportView, useTaskView } from './useOperationalView';

let lateWrite: (() => void) | undefined;
function Probe() {
  const view = useTaskView(), location = useLocation(), navigate = useNavigate();
  lateWrite = () => view.update({ search: 'late input' });
  return <><output aria-label="Current location">{location.pathname + location.search}</output>
    <button onClick={() => view.update({ viewMode: 'card' })}>Current Board</button>
    <button onClick={() => { navigate('/reports?org=current-org&project=current-project'); view.update({ search: 'stale input' }); }}>Leave then late write</button>
    <button onClick={() => navigate(-1)}>Back</button></>;
}
function ReportProbe() {
  const view = useReportView(), navigate = useNavigate();
  return <><button onClick={() => view.update({ windowDays: 30 })}>Current 30 days</button>
    <button onClick={() => navigate(-1)}>Back</button></>;
}
afterEach(() => { lateWrite = undefined;window.history.replaceState(null, '', '/'); });
describe('Operational URL writers', () => {
  it.each(['/tasks', '/tasks?q=release&org=org-1', '/tasks?view=board', '/tasks?view=board&ready=0&priority=&sort='])('does not create a duplicate history entry for unchanged state in %s', initialEntry => {
    render(<MemoryRouter initialEntries={['/before', initialEntry]} initialIndex={1}>
      <Routes><Route path="/tasks" element={<Probe />} /><Route path="/before" element={<p>Previous screen</p>} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Current Board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Previous screen')).toBeInTheDocument();
  });
  it.each(['/reports?days=30', '/reports?org=org-1&days=30'])('does not add history when the explicit current report window is selected in %s', initialEntry => {
    render(<MemoryRouter initialEntries={['/before', initialEntry]} initialIndex={1}>
      <Routes><Route path="/reports" element={<ReportProbe />} /><Route path="/before" element={<p>Previous screen</p>} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Current 30 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Previous screen')).toBeInTheDocument();
  });
  it('does not resurrect a page when a writer arrives during the live navigation gap', () => {
    window.history.replaceState(null, '', '/tasks?org=old-org&project=old-project');
    render(<BrowserRouter><Probe /></BrowserRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Leave then late write' }));
    expect(window.location.pathname + window.location.search).toBe('/reports?org=current-org&project=current-project');
  });
  it('ignores an asynchronous writer after its owning screen unmounts', () => {
    window.history.replaceState(null, '', '/tasks?org=old-org');
    const view = render(<BrowserRouter><Probe /></BrowserRouter>), write = lateWrite!;
    view.unmount();window.history.pushState({ key: 'departed' }, '', '/reports?org=current-org');
    act(() => write());
    expect(window.location.pathname + window.location.search).toBe('/reports?org=current-org');
  });
});
