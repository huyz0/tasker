import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from './AppShell';
import { WorkbenchPreview } from '../../../.storybook/WorkbenchPreview';

const meta = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
    router: false,
    docs: { description: { component: 'Synthetic query fixtures render the shell without credentials. The live connection indicator uses the real transport and may show offline when Storybook has no event service.' } },
  },
  tags: ['autodocs'],
  decorators: [(Story, context) => <WorkbenchPreview drawerOpen={context.parameters.drawerOpen === true}><Story /></WorkbenchPreview>],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

// Dummy content to visualize the main panel area pushing flex boundaries
const ContentSimulator = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="type-page-title">Dashboard Overview</h1>
      <p className="text-muted-foreground mt-1">Daily work, knowledge and automation stay above collapsible workspace settings.</p>
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
    drawerOpen: true,
    viewport: {
      defaultViewport: 'mobile1',
    },
  },

};
