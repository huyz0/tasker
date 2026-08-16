import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterPage from './Register';
import { expectNoA11yViolations } from '../test/a11y';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterPage Component', () => {
  it('should render the page title', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeDefined();
  });

  it('should render the registration form', () => {
    renderPage();
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByLabelText(/Email/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDefined();
  });

  it('links back to the login page for someone who already has an account', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    await expectNoA11yViolations(container);
  });
});
