// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { ArtifactsBrowser } from './index';

const meta: Meta<typeof ArtifactsBrowser> = {
  title: 'Features/ArtifactsBrowser',
  component: ArtifactsBrowser,
};
export default meta;
export const Default: StoryObj<typeof ArtifactsBrowser> = {};
