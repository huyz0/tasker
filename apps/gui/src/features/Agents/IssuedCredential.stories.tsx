import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { agentTokenFixture, fixtureCredential } from '../../../.storybook/agentTokenFixture';
import { IssuedCredential } from './IssuedCredential';
function Preview({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><div className="max-w-2xl">{children}</div></QueryClientProvider>;
}
const meta = {
  title: 'Features/Agents/IssuedCredential', component: IssuedCredential,
  beforeEach: () => agentTokenFixture(), parameters: { layout: 'padded' },
  decorators: [Story => <Preview><Story /></Preview>],
  args: { credential: fixtureCredential, projectId: 'project-storybook', focusOnReveal: false, onVerified: () => undefined, onDismiss: () => undefined },
} satisfies Meta<typeof IssuedCredential>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
