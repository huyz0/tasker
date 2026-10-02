import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockLoginWithPassword, mockNavigate, mockInvalidateQueries } = vi.hoisted(() => ({
  mockLoginWithPassword: vi.fn(),
  mockNavigate: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('../../lib/passwordAuth', async () => ({
  ...(await vi.importActual<typeof import('../../lib/passwordAuth')>('../../lib/passwordAuth')),
  loginWithPassword: mockLoginWithPassword,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { LoginForm } from './LoginForm';
import { PasswordAuthError } from '../../lib/passwordAuth';
import { expectNoA11yViolations } from '../../test/a11y';

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.invalidateQueries = mockInvalidateQueries;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();
    await expectNoA11yViolations(container);
  });

  it('submits the trimmed username and the password as typed', async () => {
    mockLoginWithPassword.mockResolvedValue({ userId: 'user-1', mustChangePassword: false });
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '  alice  ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockLoginWithPassword).toHaveBeenCalledWith('alice', 'a-strong-password-123'));
  });

  it('keeps the submit button enabled on an empty form, so the primary action is visible before typing', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('validates inline on submit: names each missing field, marks it invalid, and focuses the first one', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const username = screen.getByLabelText('Username');
    const password = screen.getByLabelText('Password');
    expect(username).toHaveAttribute('aria-invalid', 'true');
    expect(username).toHaveAccessibleDescription('Enter your username.');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Enter your password.');
    expect(document.activeElement).toBe(username);
    expect(mockLoginWithPassword).not.toHaveBeenCalled();
  });

  it('focuses the password when only the password is missing', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
  });

  it('invalidates the authSession query and navigates home on success', async () => {
    mockLoginWithPassword.mockResolvedValue({ userId: 'user-1', mustChangePassword: false });
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['authSession'] });
  });

  it('shows the server\'s error message on invalid credentials, and does not navigate', async () => {
    mockLoginWithPassword.mockRejectedValue(new PasswordAuthError('The username or password is incorrect.', 401));
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The username or password is incorrect.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a lockout message with the retry countdown on a 429', async () => {
    mockLoginWithPassword.mockRejectedValue(
      new PasswordAuthError('Too many failed attempts. Try again in 30 seconds.', 429, 30),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Try again in 30s.');
  });

  it('shows the lockout message plainly when the server sent no retryAfterSeconds', async () => {
    mockLoginWithPassword.mockRejectedValue(new PasswordAuthError('Account temporarily locked.', 429));
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Account temporarily locked.');
    expect(alert.textContent).not.toContain('Try again in');
  });

  it('shows a "Signing in…" label while the request is in flight', async () => {
    let resolveLogin!: (v: { userId: string; mustChangePassword: boolean }) => void;
    mockLoginWithPassword.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve; }));
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolveLogin({ userId: 'user-1', mustChangePassword: false });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it('ignores a submit event with an empty field, (e.g. pressing Enter)', () => {
    renderForm();
    const form = screen.getByRole('form', { name: 'Sign in with username and password' });

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '   ' } });
    fireEvent.submit(form);
    expect(mockLoginWithPassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.submit(form); // password still empty
    expect(mockLoginWithPassword).not.toHaveBeenCalled();
  });
});
