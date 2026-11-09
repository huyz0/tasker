import { beforeEach, afterEach, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { server, mockRpc } from '../../test/mockRpc';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { CurrentUser } from '../../components/layout/CurrentUser';
import { renderScoped } from '../../test/renderScoped';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { LoginForm } from '../Auth/LoginForm';
import { TaskSummaryPanel } from './TaskSummary';
import { useSummaryDrafts } from './summaryDrafts';

beforeEach(() => { useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount('account-a'); });
afterEach(() => useSummaryDrafts.getState().endSession());

it.each(['held', 'failed'])('password login cannot show a previous account draft while the session refresh is %s', async mode => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['identity'], { id: 'account-a', name: 'Account A', email: 'a@example.test' });
  mockRpc(AuthService, 'GetIdentity', { user: { id: 'account-b', name: 'Account B', email: 'b@example.test' } });
  queryClient.setQueryData(['authSession'], { authenticated: true, userId: 'account-a', mustChangePassword: false });
  server.use(http.post(`${BACKEND_URL}/api/auth/password/login`, () => HttpResponse.json({ userId: 'account-b', mustChangePassword: false })));
  let lookups = 0;
  server.use(http.get(`${BACKEND_URL}/api/auth/session`, () => {
    lookups++;
    return mode === 'held' ? new Promise<Response>(() => {}) : HttpResponse.json({ message: 'Session lookup offline' }, { status: 503 });
  }));
  const view = renderScoped(<Routes>
    <Route path="/tasks" element={<ProtectedRoute><Link to="/login">Use another account</Link><TaskSummaryPanel taskId="shared-task" /></ProtectedRoute>} />
    <Route path="/login" element={<LoginForm />} />
    <Route path="/" element={<ProtectedRoute><CurrentUser /><TaskSummaryPanel taskId="shared-task" /></ProtectedRoute>} />
  </Routes>, { initialEntry: '/tasks', queryClient });
  fireEvent.click(await screen.findByRole('button', { name: 'Write a summary' }));
  fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Account A private draft' } });
  fireEvent.click(screen.getByRole('link', { name: 'Use another account' }));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'account-b' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password-only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(view.location.pathname).toBe('/'));
  await waitFor(() => expect(lookups).toBeGreaterThan(0));
  expect(screen.queryByDisplayValue('Account A private draft')).toBeNull();
  expect(screen.queryByRole('group', { name: 'Signed in as Account A' })).toBeNull();
  expect(await screen.findByRole('group', { name: 'Signed in as Account B' })).toBeInTheDocument();
  const button = await screen.findByRole('button', { name: 'Write a summary' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(screen.getByLabelText('Summary')).toHaveValue('');
});
