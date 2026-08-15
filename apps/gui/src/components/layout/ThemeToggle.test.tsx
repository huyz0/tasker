import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { useLayoutStore, applyTheme, loadTheme } from '../../store/layout';

/** Pretends the machine is set to dark. */
const systemPrefersDark = (dark: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  systemPrefersDark(false);
  useLayoutStore.setState({ theme: 'system' });
});

describe('applyTheme', () => {
  it('writes the choice to the root element', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolves "system" to what the machine is asking for', () => {
    systemPrefersDark(true);
    applyTheme('system');
    // Resolved here rather than in CSS, so the stylesheet has one dark block
    // instead of one per trigger.
    expect(document.documentElement.dataset.theme).toBe('dark');

    systemPrefersDark(false);
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('loadTheme', () => {
  it('defaults to system when nothing is stored', () => {
    expect(loadTheme()).toBe('system');
  });

  it('reads back a stored choice', () => {
    localStorage.setItem('tasker.theme', 'dark');
    expect(loadTheme()).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem('tasker.theme', 'purple');
    // Anything could be in localStorage — another app, an older build, a user
    // with a console open.
    expect(loadTheme()).toBe('system');
  });

  it('survives storage being unavailable', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      // Private browsing throws here. A theme is not worth failing to start.
      expect(loadTheme()).toBe('system');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe('ThemeToggle', () => {
  it('offers light, dark and following the machine', () => {
    render(<ThemeToggle />);
    // A two-state switch cannot say "follow the OS", so it either ignores the
    // preference the user already expressed or silently overrides it.
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
  });

  it('marks the active choice for assistive technology', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('applies and persists the choice', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('tasker.theme')).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  it('lets an explicit light beat a machine set to dark', () => {
    systemPrefersDark(true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));

    // The reason the stylesheet stopped keying off prefers-color-scheme: a
    // media query would keep firing and the choice would only work one way.
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('still changes the theme when storage refuses to save', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      render(<ThemeToggle />);
      fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
      // The choice applies for this session; it just will not survive a reload,
      // which beats refusing to change the theme at all.
      expect(document.documentElement.dataset.theme).toBe('dark');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
