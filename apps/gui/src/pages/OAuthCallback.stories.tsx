import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallback } from './OAuthCallback';

// Owns a repository client only reached once valid code/state land in the URL.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Pages/OAuthCallback',
  component: OAuthCallback,
  parameters: { router: false,
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
// this settles into the real unavailable-link error in the static audit.
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
