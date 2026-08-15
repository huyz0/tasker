import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs';

const renderCrumbs = (items: { label: string; to?: string }[]) =>
  render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  );

describe('Breadcrumbs', () => {
  it('is a labelled navigation landmark', () => {
    renderCrumbs([{ label: 'Tasks', to: '/tasks' }, { label: 'SEED-1' }]);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('links every ancestor', () => {
    renderCrumbs([
      { label: 'Seed Project', to: '/projects' },
      { label: 'Tasks', to: '/tasks' },
      { label: 'SEED-145' },
    ]);
    expect(screen.getByRole('link', { name: 'Seed Project' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks');
  });

  it('does not link the page you are already on', () => {
    renderCrumbs([{ label: 'Tasks', to: '/tasks' }, { label: 'SEED-145', to: '/tasks/1' }]);
    // A link to the current page is a control that appears to do nothing.
    expect(screen.queryByRole('link', { name: 'SEED-145' })).toBeNull();
    expect(screen.getByText('SEED-145')).toHaveAttribute('aria-current', 'page');
  });

  it('marks only the last crumb as the current page', () => {
    renderCrumbs([{ label: 'A', to: '/a' }, { label: 'B', to: '/b' }, { label: 'C' }]);
    expect(screen.getByText('C')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'B' })).not.toHaveAttribute('aria-current');
  });

  it('renders a crumb with no link as plain text', () => {
    // Folder names in the artifact path have no route of their own.
    renderCrumbs([{ label: 'Artifacts', to: '/artifacts' }, { label: 'docs' }, { label: 'readme.md' }]);
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'docs' })).toBeNull();
  });

  it('renders an ordered list, so the depth is announced', () => {
    renderCrumbs([{ label: 'A', to: '/a' }, { label: 'B' }]);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders nothing at all when there is no path', () => {
    const { container } = renderCrumbs([]);
    // An empty <nav> is still announced as a landmark with nothing in it.
    expect(container).toBeEmptyDOMElement();
  });
});
