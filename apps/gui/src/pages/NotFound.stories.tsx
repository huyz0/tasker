// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFound } from './NotFound';

const meta: Meta<typeof NotFound> = {
  title: 'Pages/NotFound',
  component: NotFound,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/nonsense']}>
        <div className="h-[500px] bg-background p-8">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};
export default meta;

export const Default: StoryObj<typeof NotFound> = {};

export const DeepPath: StoryObj<typeof NotFound> = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/projects/does-not-exist/settings']}>
        <div className="h-[500px] bg-background p-8">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};
