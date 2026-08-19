import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Only one story, not the caught-error state too. A child that throws during
 * render is exactly what would need to be rendered to reach it, and doing so
 * here kept `moon run gui:storybook-test`'s a11y runner from ever reaching
 * `networkidle` on that story - Vite's dev-mode error overlay for an
 * uncaught render error keeps its own connection open, which is a real
 * incompatibility with this harness's wait strategy, not something to route
 * around blindly. `ErrorBoundary.test.tsx` already covers the caught state
 * with a throwing child in a real DOM assertion, just not through Storybook.
 */
const meta = {
  title: 'UI/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: {
    children: <div className="p-8 text-sm text-muted-foreground">Normal content, nothing has thrown.</div>,
  },
};
