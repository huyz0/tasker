import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GenericPlaceholder } from './GenericPlaceholder';

const mockSetActivePageTitle = vi.fn();
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({ setActivePageTitle: mockSetActivePageTitle })),
}));

describe('GenericPlaceholder', () => {
  it('renders the title and description, and sets the active page title', () => {
    render(<GenericPlaceholder title="Settings" description="Global application preferences." />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Global application preferences.')).toBeInTheDocument();
    expect(screen.getByText('Settings module placeholder area.')).toBeInTheDocument();
    expect(mockSetActivePageTitle).toHaveBeenCalledWith('Settings');
  });
});
