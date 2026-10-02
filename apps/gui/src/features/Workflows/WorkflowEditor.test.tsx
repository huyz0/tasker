import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { WorkflowTemplateSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { WorkflowEditor, draftFrom } from './WorkflowEditor';

const template = create(WorkflowTemplateSchema, {
  id: 'w1', name: 'Release', description: 'Cut it',
  steps: [
    { key: 'build', title: 'Build', priority: 2, dependsOn: [] },
    { key: 'ship', title: 'Ship', priority: 0, dependsOn: ['build'], taskTypeId: 'tt1', status: 'queued' },
  ],
});

describe('WorkflowEditor (M42)', () => {
  it('starts a new workflow with one empty step and will not save it blank', () => {
    const onSave = vi.fn();
    render(<WorkflowEditor initial={draftFrom()} saving={false} onSave={onSave} />);
    expect(screen.getByLabelText('Key')).toHaveValue('step-1');
    expect(screen.getByRole('button', { name: 'Save workflow' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove step 1' })).toBeDisabled();
  });

  it('builds steps and dependencies, and saves the whole draft', () => {
    const onSave = vi.fn();
    render(<WorkflowEditor initial={draftFrom()} saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Onboard' } });
    fireEvent.change(screen.getByLabelText('Step 1 title'), { target: { value: 'Create account' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 2 title'), { target: { value: 'Kickoff call' } });
    fireEvent.change(screen.getAllByLabelText('Priority')[1]!, { target: { value: '1' } });
    const waits = screen.getByRole('group', { name: 'Step 2 waits for' });
    fireEvent.click(within(waits).getByLabelText('Create account'));
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Onboard', description: '',
      steps: [
        { key: 'step-1', title: 'Create account', description: '', priority: 0, dependsOn: [] },
        { key: 'step-2', title: 'Kickoff call', description: '', priority: 1, dependsOn: ['step-1'] },
      ],
    });
  });

  it('renaming a key carries its dependents, removing a step drops it from them, and typed steps keep their type', () => {
    const onSave = vi.fn();
    render(<WorkflowEditor initial={draftFrom(template)} saving={false} onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getAllByLabelText('Key')[0]!, { target: { value: 'Compile' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(onSave.mock.calls[0]![0].steps[1]).toMatchObject({ key: 'ship', dependsOn: ['compile'], taskTypeId: 'tt1', status: 'queued' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(onSave.mock.calls[1]![0].steps).toEqual([expect.objectContaining({ key: 'ship', dependsOn: [] })]);
    // Unticking a dependency.
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 2 title'), { target: { value: 'After' } });
    const waits = screen.getByRole('group', { name: 'Step 2 waits for' });
    fireEvent.click(within(waits).getByLabelText('Ship'));
    fireEvent.click(within(waits).getByLabelText('Ship'));
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(onSave.mock.calls[2]![0].steps[1].dependsOn).toEqual([]);
  });

  it('shows the server\'s refusal and the saving state', () => {
    render(<WorkflowEditor initial={draftFrom(template)} saving error='the steps "a", "b" depend on each other in a cycle' onSave={() => {}} />);
    expect(screen.getByText(/Could not save: the steps "a", "b" depend on each other/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('edits the description and never reuses a step key', () => {
    const onSave = vi.fn();
    render(<WorkflowEditor initial={{ name: 'N', description: '', steps: [{ key: 'step-2', title: 'A', description: '', priority: 0, dependsOn: [] }] }} saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'Why' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(screen.getAllByLabelText('Key')[1]).toHaveValue('step-3');
    fireEvent.change(screen.getByLabelText('Step 2 title'), { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ description: 'Why' });
  });
});
