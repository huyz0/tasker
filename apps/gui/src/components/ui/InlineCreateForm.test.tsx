import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InlineCreateForm } from './InlineCreateForm';

describe('InlineCreateForm', () => {
  it('renders an input with the given placeholder', () => {
    render(<InlineCreateForm placeholder="Folder name" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByPlaceholderText('Folder name')).toBeDefined();
  });

  it('submits the trimmed non-empty value on Enter', () => {
    const onSubmit = vi.fn();
    render(<InlineCreateForm placeholder="Folder name" onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: '  My Folder  ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith('My Folder');
  });

  it('submits the trimmed non-empty value when the Add button is clicked', () => {
    const onSubmit = vi.fn();
    render(<InlineCreateForm placeholder="Artifact name" onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByPlaceholderText('Artifact name');
    fireEvent.change(input, { target: { value: 'notes.md' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onSubmit).toHaveBeenCalledWith('notes.md');
  });

  it('calls onCancel on blur when the input is empty, without submitting', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<InlineCreateForm placeholder="Folder name" onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.blur(screen.getByPlaceholderText('Folder name'));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not call onCancel on blur when the input has a non-empty value', () => {
    const onCancel = vi.fn();
    render(<InlineCreateForm placeholder="Folder name" onSubmit={vi.fn()} onCancel={onCancel} />);

    const input = screen.getByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'Docs' } });
    fireEvent.blur(input);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not submit an empty or whitespace-only value on Enter', () => {
    const onSubmit = vi.fn();
    render(<InlineCreateForm placeholder="Folder name" onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button while isSubmitting is true', () => {
    render(<InlineCreateForm placeholder="Folder name" onSubmit={vi.fn()} onCancel={vi.fn()} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
