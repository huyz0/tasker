import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScheduleRefreshAlert } from './RefreshAlert';

const meta = {
  title: 'Features/Schedules/RefreshAlert', component: ScheduleRefreshAlert,
  args: { onRetry: () => undefined },
  decorators: [(Story) => <div className="max-w-xl p-panel"><Story /></div>],
} satisfies Meta<typeof ScheduleRefreshAlert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DraftKept: Story = {};
