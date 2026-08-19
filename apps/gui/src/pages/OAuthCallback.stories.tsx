import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallback } from './OAuthCallback';

// Owns a real createClient(...) call (RepositoryService.addRepositoryLink),
// only reached once a valid code+state land in the URL. No global
// QueryClientProvider decorator exists in .storybook/preview.tsx, and no
// MSW is wired in.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Pages/OAuthCallback',
  component: OAuthCallback,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof OAuthCallback>;

export default meta;
type Story = StoryObj<typeof meta>;

// No code/state in the URL - a genuine, zero-mocking, zero-RPC error state
// (the component short-circuits before ever calling addRepositoryLink).
export const MissingAuthorizationCode: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/oauth/callback']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

// A valid code+state, with sessionStorage's nonce set to match (the same
// CSRF check the real flow performs) before mount - real, unmocked
// addRepositoryLink call against an unreachable-in-Storybook backend, so
// this shows the "Linking Repository..." state, which never resolves here.
const nonce = 'storybook-nonce';
const state = btoa(JSON.stringify({ nonce, projectId: 'proj-storybook', provider: 'github', remoteName: 'origin' }));

export const Linking: Story = {
  decorators: [
    (Story) => {
      sessionStorage.setItem('repoLinkOauthNonce', nonce);
      return (
        <MemoryRouter initialEntries={[`/oauth/callback?code=storybook-code&state=${encodeURIComponent(state)}`]}>
          <Story />
        </MemoryRouter>
      );
    },
  ],
};
