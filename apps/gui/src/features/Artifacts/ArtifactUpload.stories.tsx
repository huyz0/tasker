import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactUpload } from './ArtifactUpload';

// Owns a real createClient(...) call (ArtifactService), only reached once a
// file is actually picked - so, unlike the manager screens, the resting
// state here (an empty description field and a file input) needs no mocking
// at all to render meaningfully; nothing fetches until a user acts.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/Artifacts/ArtifactUpload',
  component: ArtifactUpload,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-xs border rounded-md">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ArtifactUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    folderId: 'folder-storybook',
  },
};
