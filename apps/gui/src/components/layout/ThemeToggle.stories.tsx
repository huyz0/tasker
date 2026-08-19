import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeToggle } from './ThemeToggle';
import { useLayoutStore } from '../../store/layout';

// Uses the real useLayoutStore (the same store the app itself uses, not a
// mock of it) - the same convention Memory/Handoffs' own stories established
// for driving a real zustand store into a specific state via setState.
const meta = {
  title: 'Layout/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ theme: 'light' });
      return <Story />;
    },
  ],
};

export const Dark: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ theme: 'dark' });
      return <Story />;
    },
  ],
};

export const System: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ theme: 'system' });
      return <Story />;
    },
  ],
};
