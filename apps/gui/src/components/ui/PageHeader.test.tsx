import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the page title as the one h1', () => {
    render(<PageHeader title="Labels" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Labels' })).toBeInTheDocument();
  });

  it('renders the description under the title when there is one', () => {
    render(<PageHeader title="Labels" description="Tags you can put on any task." />);
    expect(screen.getByText('Tags you can put on any task.')).toBeInTheDocument();
  });

  it('renders no empty description paragraph when there is none', () => {
    const { container } = render(<PageHeader title="Labels" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders actions beside the title', () => {
    render(<PageHeader title="Roles" actions={<button>Create role</button>} />);
    expect(screen.getByRole('button', { name: 'Create role' })).toBeInTheDocument();
  });
});
