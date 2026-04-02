import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LoginPage from './Login';

describe('LoginPage Component', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render the page title and subtitle', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Tasker' })).toBeDefined();
    expect(screen.getByText('Autonomous SDLC Platform')).toBeDefined();
  });

  it('should render the Google login button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDefined();
  });

  it('should redirect to the backend OAuth endpoint when the button is clicked', () => {
    const location = { ...window.location, href: '' };
    vi.stubGlobal('location', location);

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(window.location.href).toBe('/api/auth/google/login');
  });

  it('should only render a single button', () => {
    render(<LoginPage />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

