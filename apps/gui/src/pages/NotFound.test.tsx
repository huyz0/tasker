import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { mockSetActivePageTitle } = vi.hoisted(() => ({ mockSetActivePageTitle: vi.fn() }));

vi.mock('../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({ setActivePageTitle: mockSetActivePageTitle })),
}));

import { NotFound } from './NotFound';

function renderPage(path = '/nonsense') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFound />
    </MemoryRouter>
  );
}

describe('NotFound', () => {
  beforeEach(() => {
    mockSetActivePageTitle.mockReset();
  });

  it('renders a heading instead of an empty pane', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('names the URL that missed', () => {
    renderPage('/definitely/not/a/route');
    expect(screen.getByText('/definitely/not/a/route')).toBeInTheDocument();
  });

  it('offers a route back to the dashboard', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });

  it('sets the shell page title', () => {
    renderPage();
    expect(mockSetActivePageTitle).toHaveBeenCalledWith('Not Found');
  });
});
