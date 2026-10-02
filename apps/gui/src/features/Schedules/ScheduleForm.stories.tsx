import type { Meta, StoryObj } from '@storybook/react-vite';
import { create } from '@bufbuild/protobuf';
import { ScheduleSchema, WorkflowTemplateSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ScheduleForm, draftFromSchedule } from './ScheduleForm';

const projects = [{ id: 'p1', name: 'Platform' }, { id: 'p2', name: 'Growth' }];
const templates = [create(WorkflowTemplateSchema, { id: 'w1', name: 'Weekly report' })];

const meta = {
  title: 'Features/Schedules/ScheduleForm',
  component: ScheduleForm,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
  args: { projects, templates, saving: false, onSave: () => {} },
} satisfies Meta<typeof ScheduleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewWeeklyTask: Story = { args: { initial: draftFromSchedule(undefined, 'p1') } };

export const MonthlyWorkflow: Story = {
  args: {
    projectLocked: true,
    initial: draftFromSchedule(create(ScheduleSchema, {
      id: 's1', projectId: 'p1', name: 'Monthly report', cadence: 'monthly', dayOfMonth: 1, hourUtc: 6, templateId: 'w1', skipIfOpen: true, active: true,
    }), 'p1'),
  },
};
