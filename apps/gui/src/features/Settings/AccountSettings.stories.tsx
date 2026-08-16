// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSettings } from './AccountSettings';

// No global QueryClientProvider decorator exists in .storybook/preview.tsx
// (see LoginForm.stories.tsx's note) — scoped here for the same reason.
const meta: Meta<typeof AccountSettings> = {
  title: 'Features/Settings/AccountSettings',
  component: AccountSettings,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <div className="max-w-2xl p-8">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};
export default meta;

// Renders against the real transport with no backend running, so this
// story shows the loading/error path rather than a populated one — the
// same honest limitation every other RPC-backed story in this repo has
// (see Features/OrganizationsDashboard).
export const Default: StoryObj<typeof AccountSettings> = {};
