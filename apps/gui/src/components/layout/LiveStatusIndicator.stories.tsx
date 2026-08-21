import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveStatusIndicator } from './LiveStatusIndicator';

// Purely presentational — the connection lives in AppShell — so every state is
// reachable by passing it, with no store or transport to stand up.
const meta = {
  title: 'Layout/LiveStatusIndicator',
  component: LiveStatusIndicator,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof LiveStatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The state a fresh mount is in, before the server has acknowledged anything. */
export const Connecting: Story = { args: { status: 'connecting' } };

/** Deliberately near-silent: a working app should not narrate itself. */
export const Live: Story = { args: { status: 'live' } };

/** One drop, usually a deploy. The retry is already scheduled. */
export const Reconnecting: Story = { args: { status: 'reconnecting' } };

/** Repeated failures. Polling is carrying the screen instead of the stream. */
export const Offline: Story = { args: { status: 'offline' } };
