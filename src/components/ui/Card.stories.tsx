import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Card from './Card';

const meta = {
  title: 'Foundation/Card',
  component: Card,
  parameters: { layout: 'centered' },
  argTypes: { padding: { control: 'inline-radio', options: ['none', 'sm', 'md', 'lg'] } },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} style={{ width: 280 }}>
      <h3 className="font-heading text-lg">Westlake Dermatology</h3>
      <p className="mt-1 text-sm text-text-muted">Austin, TX · Territory #142</p>
    </Card>
  ),
};

export const Interactive: Story = {
  args: { interactive: true },
  render: (args) => (
    <Card {...args} style={{ width: 280 }}>
      <h3 className="font-heading text-lg">Hover me</h3>
      <p className="mt-1 text-sm text-text-muted">Elevates on hover for clickable cards.</p>
    </Card>
  ),
};
