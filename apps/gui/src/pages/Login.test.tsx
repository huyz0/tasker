import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import LoginPage from './Login';

describe('LoginPage Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render the login card correctly', () => {
    render(<LoginPage />);
    expect(screen.getByText('Tasker')).toBeDefined();
    expect(screen.getByText('Autonomous SDLC Platform')).toBeDefined();
    expect(screen.getByText('Continue with Google')).toBeDefined();
  });

  it('should trigger redirect to the backend auth endpoint when Google is clicked', () => {
    // Scaffold: mock window.location.href changes using Object.defineProperty
    const originalLocation = window.location;
    // @ts-expect-error: Intentionally bypassing readonly for testing
    delete window.location;
    // @ts-expect-error: Bypassing string & Location type mismatch
    window.location = { ...originalLocation, href: '' } as unknown as Location;

    render(<LoginPage />);
    
    const loginButton = screen.getByText('Continue with Google');
    fireEvent.click(loginButton);
    
    expect(window.location.href).toBe('/api/auth/google/login');
    
    // Restore window.location
    // @ts-expect-error: Bypassing string & Location type mismatch
    window.location = originalLocation as unknown as Location;
  });
});
