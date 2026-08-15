import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListState } from './ListState';

const props = {
  isLoading: false,
  error: null as unknown,
  isEmpty: false,
  emptyMessage: 'No projects yet.',
};

describe('ListState', () => {
  it('renders the list when there is one', () => {
    render(<ListState {...props}><p>Seed Project</p></ListState>);
    expect(screen.getByText('Seed Project')).toBeInTheDocument();
  });

  it('says it is loading before anything has arrived', () => {
    render(<ListState {...props} isLoading loadingMessage="Loading projects…"><p>Seed Project</p></ListState>);
    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
    expect(screen.queryByText('Seed Project')).toBeNull();
  });

  it('does not claim the list is empty when the request failed', () => {
    // The defect this component exists for: a failed query used to fall through
    // to the empty branch and tell the user their data was gone (M06-T11).
    render(<ListState {...props} isEmpty error={new Error('unavailable')} />);
    expect(screen.queryByText('No projects yet.')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
  });

  it('reports the error as an alert, so it is announced', () => {
    render(<ListState {...props} error={new Error('permission denied')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this list: permission denied');
  });

  it('offers a way out of a failure', () => {
    const onRetry = vi.fn();
    render(<ListState {...props} error={new Error('boom')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry button when there is nothing to retry with', () => {
    render(<ListState {...props} error={new Error('boom')} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('survives a thrown value that is not an Error', () => {
    // connect-es rejects with its own ConnectError; a plain string is what a
    // hand-rolled queryFn throws.
    render(<ListState {...props} error={'just a string'} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this list');
  });

  it('gives an empty list an action rather than a dead end', () => {
    render(
      <ListState {...props} isEmpty emptyAction={<button>Create a project</button>} />,
    );
    expect(screen.getByText('No projects yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a project' })).toBeInTheDocument();
  });

  it('prefers loading over empty, so a first paint does not flash "nothing here"', () => {
    render(<ListState {...props} isLoading isEmpty />);
    expect(screen.queryByText('No projects yet.')).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});
