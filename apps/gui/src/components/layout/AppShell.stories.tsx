import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from './AppShell';
import { useLayoutStore } from '../../store/layout';

const meta = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

// Dummy content to visualize the main panel area pushing flex boundaries
const ContentSimulator = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard Overview</h1>
      <p className="text-muted-foreground mt-1">This is a simulated layout pane.</p>
    </div>
    <div className="p-12 border rounded-lg bg-card text-muted-foreground flex items-center justify-center border-dashed">
      <p>AppShell Content Area</p>
    </div>
  </div>
);

export const Desktop: Story = {
  args: {
    children: <ContentSimulator />,
  },
};

export const MobileDrawerOpen: Story = {
  args: {
    children: <ContentSimulator />,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  decorators: [
    (StoryFn) => {
      // Force store to emulate open sidebar drawer on mobile load
      useLayoutStore.setState({ sidebarOpen: true });
      return <StoryFn />;
    },
  ],
};
