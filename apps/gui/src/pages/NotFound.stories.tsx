// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFound } from './NotFound';

const meta: Meta<typeof NotFound> = {
  title: 'Pages/NotFound',
  component: NotFound,
  parameters: { router: false, layout: 'fullscreen' },
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.initialEntry ?? '/nonsense']}>
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
  parameters: { initialEntry: '/projects/does-not-exist/settings' },
};
