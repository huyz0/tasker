import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskTypeHeader } from './TaskTypeHeader';
import { useLayoutStore } from '../../store/layout';

/**
 * The detail pane's identity strip: the trail back to the list, the type's
 * name, and the rename that edits it. The trail has two crumbs and no third —
 * see the component's own note on why a task type has no project parent.
 *
 * Nothing here reads from the network (the rename is a mutation, fired only
 * on submit), so these are the real states rather than a loading stand-in.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/TaskTypes/TaskTypeHeader',
  component: TaskTypeHeader,
  parameters: { layout: 'padded' },
  args: { typeId: 'tt-1' },
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook' });
      return (
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta<typeof TaskTypeHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: 'Bug' },
};

/**
 * A deep link renders the detail before the list that holds the names does,
 * so the trail says what kind of thing is open rather than showing a gap.
 */
export const NameNotYetLoaded: Story = {
  args: { name: '' },
};

/** Long names truncate inside the crumb rather than wrapping the trail. */
export const LongName: Story = {
  args: { name: 'Customer-reported production incident' },
};
