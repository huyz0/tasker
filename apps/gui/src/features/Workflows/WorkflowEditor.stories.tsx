import type { Meta, StoryObj } from '@storybook/react-vite';
import { create } from '@bufbuild/protobuf';
import { WorkflowTemplateSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { WorkflowEditor, draftFrom } from './WorkflowEditor';

const meta = {
  title: 'Features/Workflows/WorkflowEditor',
  component: WorkflowEditor,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
  args: { saving: false, onSave: () => {} },
} satisfies Meta<typeof WorkflowEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewWorkflow: Story = { args: { initial: draftFrom() } };

export const Release: Story = {
  args: {
    initial: draftFrom(create(WorkflowTemplateSchema, {
      id: 'w1', name: 'Release', description: 'Cut, verify and ship a release.',
      steps: [
        { key: 'build', title: 'Build artifacts', priority: 2, dependsOn: [] },
        { key: 'test', title: 'Run the suite', priority: 0, dependsOn: ['build'] },
        { key: 'notes', title: 'Write release notes', priority: 0, dependsOn: [] },
        { key: 'ship', title: 'Ship it', priority: 1, dependsOn: ['test', 'notes'] },
      ],
    })),
  },
};

export const Refused: Story = {
  args: { ...Release.args, initial: Release.args!.initial!, error: 'the steps "a", "b" depend on each other in a cycle' },
};
