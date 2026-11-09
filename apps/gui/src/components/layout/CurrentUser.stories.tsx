import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkbenchPreview } from '../../../.storybook/WorkbenchPreview';
import { CurrentUser } from './CurrentUser';

const meta = {
  title: 'Layout/CurrentUser', component: CurrentUser,
  parameters: { router: false, layout: 'padded', docs: { description: { component: 'The account indicator has an accessible group name, including when its visible name is hidden on mobile. Loading and unresolved identities intentionally render nothing and are covered by CurrentUser.test.tsx.' } } },
  decorators: [(Story) => <WorkbenchPreview><Story /></WorkbenchPreview>],
} satisfies Meta<typeof CurrentUser>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
