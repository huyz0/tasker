import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskInputRequests, QuestionsQueue } from './InputRequests';

const question = (over: Record<string, unknown> = {}) => ({
  id: 'ir-1', taskId: 't-1', taskDisplayId: 'T-1', taskTitle: 'Migrate', projectId: 'p1', question: 'Flag or main?',
  options: ['flag', 'main'], status: 'open', askedByName: 'Planner', createdAt: '2026-10-02T10:00:00Z', ...over,
});

describe('TaskInputRequests (M38)', () => {
  it('renders nothing when nobody has asked', async () => {
    mockRpc(TaskService, 'ListInputRequests', { inputRequests: [], page: {} });
    const { container } = renderScoped(<TaskInputRequests taskId="t-1" />);
    await waitFor(() => expect(container.querySelector('[aria-label="Questions from agents"]')).toBeNull());
    await waitFor(() => expect(screen.queryByText(/Loading questions/)).toBeNull());
  });

  it('puts open questions first, answers one by picking an option, and shows past answers', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'ListInputRequests', (body) => {
      requests.push(body);
      return { inputRequests: [
        question({ id: 'ir-0', status: 'answered', question: 'Old?', answer: 'yes', answeredByName: 'Ada' }),
        question(),
        question({ id: 'ir-2', status: 'cancelled', question: 'Never mind?' }),
      ], page: {} };
    });
    const answers: any[] = [];
    mockRpc(TaskService, 'AnswerInputRequest', (body) => { answers.push(body); return { inputRequest: question({ status: 'answered', answer: body.answer }) }; });
    renderScoped(<TaskInputRequests taskId="t-1" />);
    const section = await screen.findByRole('region', { name: 'Questions from agents' });
    expect(within(section).getByRole('heading')).toHaveTextContent('Waiting on you · 1');
    expect(requests[0]).toMatchObject({ taskId: 't-1', status: 'all' });
    const items = within(section).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Flag or main?');
    expect(section).toHaveTextContent('Ada answered: yes');
    expect(section).toHaveTextContent('Withdrawn.');

    const answer = within(items[0]!).getByRole('button', { name: 'Answer' });
    expect(answer).toBeDisabled();
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'main' }));
    expect(within(items[0]!).getByRole('button', { name: 'main' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(items[0]!).getByLabelText('Your answer')).toHaveValue('main');
    fireEvent.click(answer);
    await waitFor(() => expect(answers).toEqual([{ id: 'ir-1', answer: 'main' }]));
  });

  it('accepts a typed answer, and reports a refused one', async () => {
    mockRpc(TaskService, 'ListInputRequests', { inputRequests: [question({ options: [] })], page: {} });
    mockRpcError(TaskService, 'AnswerInputRequest', 'failed_precondition', 'this question is already answered');
    renderScoped(<TaskInputRequests taskId="t-1" />);
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: '  ship it  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(await screen.findByText(/Failed to answer: .*already answered/)).toBeInTheDocument();
  });

  it('shows a failed load with a way to retry', async () => {
    mockRpcError(TaskService, 'ListInputRequests', 'unavailable', 'down');
    renderScoped(<TaskInputRequests taskId="t-1" />);
    expect(await screen.findByText(/Could not load this task's questions/)).toBeInTheDocument();
  });
});

describe('QuestionsQueue (M38)', () => {
  it("lists the organization's open questions, each linked to its task", async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'ListInputRequests', (body) => { requests.push(body); return { inputRequests: [question()], page: {} }; });
    renderScoped(<QuestionsQueue orgId="org-1" />);
    const list = await screen.findByRole('list', { name: 'Open questions' });
    expect(within(list).getByRole('link', { name: 'T-1 — Migrate' })).toHaveAttribute('href', expect.stringContaining('/tasks/t-1'));
    expect(requests[0]).toMatchObject({ orgId: 'org-1', status: 'open' });
  });

  it('says when nobody is waiting', async () => {
    mockRpc(TaskService, 'ListInputRequests', { inputRequests: [], page: {} });
    renderScoped(<QuestionsQueue orgId="org-1" />);
    expect(await screen.findByText('No agent is waiting on a person.')).toBeInTheDocument();
  });
});
