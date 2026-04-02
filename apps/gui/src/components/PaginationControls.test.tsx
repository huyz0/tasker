import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaginationControls } from './PaginationControls';

describe('PaginationControls', () => {
  it('renders "No more items to load" when nextCursor is not provided', () => {
    render(<PaginationControls onNextPage={vi.fn()} />);
    expect(screen.getByText('No more items to load')).toBeDefined();
  });

  it('renders "Load More" button when nextCursor is provided', () => {
    const onNextPage = vi.fn();
    render(<PaginationControls nextCursor="cursor123" onNextPage={onNextPage} />);
    const button = screen.getByRole('button', { name: 'Load More' });
    expect(button).toBeDefined();
    
    fireEvent.click(button);
    expect(onNextPage).toHaveBeenCalledWith('cursor123');
  });

  it('renders "Loading..." and disables button when isLoading is true', () => {
    render(<PaginationControls nextCursor="cursor123" onNextPage={vi.fn()} isLoading={true} />);
    const button = screen.getByRole('button', { name: 'Loading...' }) as HTMLButtonElement;
    expect(button).toBeDefined();
    expect(button.disabled).toBe(true);
  });
});
