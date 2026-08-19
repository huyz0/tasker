import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'ghost', 'inverted'],
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg', 'icon'],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Save',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Cancel',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Dismiss',
  },
};

export const Inverted: Story = {
  args: {
    variant: 'inverted',
    children: 'Continue with Google',
  },
};

// The dedicated disabled look (M06): a distinct muted style, not a faded
// version of whichever variant was chosen - a review once mistook a
// disabled default-variant button for one that had failed to load.
export const Disabled: Story = {
  args: {
    children: 'Save',
    disabled: true,
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="inverted">Inverted</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Icon button">+</Button>
    </div>
  ),
};
