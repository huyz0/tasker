import { beforeEach, afterEach, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderScoped } from '../../test/renderScoped';
import { TaskContext } from './TaskContext';
import { useSummaryDrafts } from './summaryDrafts';

beforeEach(() => { useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount('summary-user'); });
afterEach(() => useSummaryDrafts.getState().endSession());
it('exposes a restored draft when no persisted summary would normally open Context', () => {
  const first = renderScoped(<TaskContext taskId="a" />);
  fireEvent.click(screen.getByRole('heading', { name: 'Summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
  fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Retained in Context' } });
  first.unmount();
  renderScoped(<TaskContext taskId="a" />);
  expect(screen.getByRole('heading', { name: 'Summary' }).closest('details')).toHaveAttribute('open');
  expect(screen.getByLabelText('Summary')).toHaveValue('Retained in Context');
  expect(screen.getByText('Unsaved draft')).toBeInTheDocument();
});
