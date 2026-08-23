import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { TaskTypeService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { useLayoutStore } from '../../store/layout';
import { TaskTypeHeader } from './TaskTypeHeader';

/**
 * The trail out of `/task-types/:typeId` (M28-T07). The rename half of this
 * header is exercised through the screen in `index.test.tsx`, where it has
 * been since M14-T09; these are the crumbs it grew.
 */

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: 'org-1', activeProjectId: 'proj-1' });
});

const renderHeader = (name: string, initialEntry = '/task-types/tt-1?org=org-1&project=proj-1') =>
  renderScoped(<TaskTypeHeader typeId="tt-1" name={name} />, {
    paths: ['/task-types/:typeId'], initialEntry,
  });

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

describe('TaskTypeHeader', () => {
  it('runs from the task type list to the open type, carrying scope', () => {
    renderHeader('Bug');

    expect(within(trail()).getByRole('link', { name: 'Task Types' })).toHaveAttribute(
      'href', '/task-types?org=org-1&project=proj-1',
    );
    expect(within(trail()).getByText('Bug')).toHaveAttribute('aria-current', 'page');
  });

  it('names no project, because a task type does not belong to one', () => {
    // Task types are org-scoped — `listTaskTypes` takes an `orgId` and
    // `createTaskType` sends `projectId: ''`. A project crumb here would
    // claim a parent the type does not have.
    renderHeader('Bug');

    expect(within(trail()).queryByRole('link', { name: 'Seed Project' })).toBeNull();
    expect(within(trail()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('says what kind of thing is open while its name is still loading', () => {
    // The name comes from the list query; a deep link renders the detail
    // before that list arrives.
    renderHeader('');

    expect(within(trail()).getByText('Task type')).toHaveAttribute('aria-current', 'page');
  });

  it('refuses to rename a type to nothing', () => {
    // Renaming *to* the empty string is a name nobody can find again, and the
    // rail would render a blank row for it.
    const requests: unknown[] = [];
    mockRpc(TaskTypeService, 'UpdateTaskType', (body) => {
      requests.push(body);
      return { taskType: { id: 'tt-1', name: '' } };
    });
    renderHeader('Bug');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Task type name'), { target: { value: '  ' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Task type name'));
    expect(requests).toHaveLength(0);
  });
});
