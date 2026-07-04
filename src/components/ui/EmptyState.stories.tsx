import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Users } from 'lucide-react';
import EmptyState from './EmptyState';
import Button from './Button';

const meta = {
  title: 'Foundation/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  args: { title: 'No prospects yet' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'No prospects yet', description: 'New leads land here as they come in.' },
  render: (args) => (
    <div style={{ width: 420 }}>
      <EmptyState {...args} action={<Button size="sm">Add prospect</Button>} />
    </div>
  ),
};

export const CustomIcon: Story = {
  render: () => (
    <div style={{ width: 420 }}>
      <EmptyState
        icon={Users}
        title="No prospects match this filter"
        description="Try clearing the status filter to see stalled and lost deals."
        action={<Button size="sm" variant="ghost">Clear filter</Button>}
      />
    </div>
  ),
};
