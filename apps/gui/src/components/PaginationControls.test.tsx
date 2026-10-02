import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaginationControls } from './PaginationControls';

describe('PaginationControls', () => {
  it('says the list has ended once more than one page has been loaded', () => {
    render(<PaginationControls onNextPage={vi.fn()} pagesLoaded={2} />);
    expect(screen.getByText('No more items to load')).toBeDefined();
  });

  // A one-item list ending in "No more items to load" reads as an apology for
  // a list that never paginated in the first place.
  it('shows nothing at the end of a single-page list', () => {
    const { container } = render(<PaginationControls onNextPage={vi.fn()} pagesLoaded={1} />);
    expect(screen.queryByText('No more items to load')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing at the end when the caller does not say how many pages were loaded', () => {
    render(<PaginationControls onNextPage={vi.fn()} />);
    expect(screen.queryByText('No more items to load')).toBeNull();
  });

  it('renders "Load More" button when nextCursor is provided', () => {
    const onNextPage = vi.fn();
    render(<PaginationControls nextCursor="cursor123" onNextPage={onNextPage} />);
    const button = screen.getByRole('button', { name: 'Load More' });
    expect(button).toBeDefined();
    
    fireEvent.click(button);
    expect(onNextPage).toHaveBeenCalledWith('cursor123');
  });

  it('renders the loading label and disables the button while loading', () => {
    render(<PaginationControls nextCursor="cursor123" onNextPage={vi.fn()} isLoading={true} />);
    const button = screen.getByRole('button', { name: 'Loading…' }) as HTMLButtonElement;
    expect(button).toBeDefined();
    expect(button.disabled).toBe(true);
  });
});
