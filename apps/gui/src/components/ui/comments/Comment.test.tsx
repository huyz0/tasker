import { render, screen, fireEvent, act } from '@testing-library/react';
import { expect, test, describe, vi } from 'vitest';
import { Comment } from './index';

describe('Comment Compound Component', () => {
  const mockComments = [
    {
      id: 'cmt-1',
      author: 'Human User',
      content: 'Standard human feedback',
      createdAt: new Date().toISOString(),
      isAgent: false,
    },
    {
      id: 'cmt-2',
      author: 'Agent Alpha',
      content: 'This is my internal reasoning',
      createdAt: new Date().toISOString(),
      isAgent: true,
    }
  ];

  test('Scenario 1: Creates a comment through the GUI', async () => {
    const handleAddComment = vi.fn().mockResolvedValue(undefined);
    render(
      <Comment.Provider onAddComment={handleAddComment}>
        <Comment.List />
        <Comment.Composer />
      </Comment.Provider>
    );
    
    // Write new comment
    const textarea = screen.getByPlaceholderText('Add your comment... (Markdown supported)');
    fireEvent.change(textarea, { target: { value: 'This is a **bold** comment' } });
    
    // Submit comment
    const button = screen.getByRole('button', { name: /post/i });
    await act(async () => {
      fireEvent.click(button);
    });
    
    expect(handleAddComment).toHaveBeenCalledWith('This is a **bold** comment');
  });

  test('Scenario 2: Agent Appends Reasoning with Distinct Styling', () => {
    render(
      <Comment.Provider initialComments={mockComments} onAddComment={vi.fn()}>
        <Comment.List />
      </Comment.Provider>
    );
    
    // Find standard user comment
    const humanComment = screen.getByText('Human User').closest('div.p-4');
    expect(humanComment).toHaveClass('border-border'); // Standard user styling

    // Find AI agent comment and ensure it distinctly renders
    const agentComment = screen.getByText(/Agent Alpha/).closest('div.p-4');
    expect(agentComment).toHaveClass('border-primary/20'); // distinct AI styling
    expect(screen.getByText(/🤖/)).toBeInTheDocument(); 
  });
});
