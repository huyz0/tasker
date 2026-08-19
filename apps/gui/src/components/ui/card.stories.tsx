import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardHeader, CardTitle, CardContent } from './card';
import { Button } from './button';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">No email or Google account required.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Card content goes here.</p>
        <Button className="w-full">Continue</Button>
      </CardContent>
    </Card>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Tasker</CardTitle>
      </CardHeader>
    </Card>
  ),
};
