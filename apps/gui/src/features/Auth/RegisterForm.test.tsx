import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRegisterLocalUser, mockNavigate, mockInvalidateQueries } = vi.hoisted(() => ({
  mockRegisterLocalUser: vi.fn(),
  mockNavigate: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('../../lib/passwordAuth', async () => ({
  ...(await vi.importActual<typeof import('../../lib/passwordAuth')>('../../lib/passwordAuth')),
  registerLocalUser: mockRegisterLocalUser,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { RegisterForm } from './RegisterForm';
import { PasswordAuthError } from '../../lib/passwordAuth';
import { expectNoA11yViolations } from '../../test/a11y';

const VALID_PASSWORD = 'a-strong-password-123';

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.invalidateQueries = mockInvalidateQueries;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegisterForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();
    await expectNoA11yViolations(container);
  });

  it('creates an account with no email at all — the milestone\'s own exit criterion', async () => {
    mockRegisterLocalUser.mockResolvedValue({ userId: 'user-new' });
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newlocaluser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockRegisterLocalUser).toHaveBeenCalledWith({
      username: 'newlocaluser',
      password: VALID_PASSWORD,
      email: undefined,
    }));
  });

  it('includes a trimmed email when one is given', async () => {
    mockRegisterLocalUser.mockResolvedValue({ userId: 'user-new' });
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newlocaluser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: '  new@example.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockRegisterLocalUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    ));
  });

  it('keeps the submit button disabled below the minimum username length', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('keeps the submit button disabled below the minimum password length', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newlocaluser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('invalidates the authSession query and navigates home on success', async () => {
    mockRegisterLocalUser.mockResolvedValue({ userId: 'user-new' });
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newlocaluser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['authSession'] });
  });

  it('shows the server\'s reason when the username is already taken', async () => {
    mockRegisterLocalUser.mockRejectedValue(new PasswordAuthError('username is already taken', 400));
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'taken' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('username is already taken');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a "Creating account…" label while the request is in flight', async () => {
    let resolveRegister!: (v: { userId: string }) => void;
    mockRegisterLocalUser.mockReturnValue(new Promise((resolve) => { resolveRegister = resolve; }));
    renderForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newlocaluser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled();
    resolveRegister({ userId: 'user-new' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it('ignores a submit event below the minimum lengths, bypassing the disabled button (e.g. pressing Enter)', () => {
    renderForm();
    const form = screen.getByRole('form', { name: 'Create a local account' });

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: VALID_PASSWORD } });
    fireEvent.submit(form);
    expect(mockRegisterLocalUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newlocaluser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.submit(form);
    expect(mockRegisterLocalUser).not.toHaveBeenCalled();
  });
});
