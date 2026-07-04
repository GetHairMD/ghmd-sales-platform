import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import HealthChip from './HealthChip';
import { DEAL_STATUSES } from '@/lib/pipeline-stages';

const meta = {
  title: 'Foundation/HealthChip',
  component: HealthChip,
  parameters: { layout: 'centered' },
  args: { status: 'active' },
  argTypes: { status: { control: 'inline-radio', options: DEAL_STATUSES } },
} satisfies Meta<typeof HealthChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = { args: { status: 'active' } };
export const Stalled: Story = { args: { status: 'stalled' } };
export const Lost: Story = { args: { status: 'lost' } };

export const All: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      {DEAL_STATUSES.map((s) => (
        <HealthChip key={s} status={s} />
      ))}
    </div>
  ),
};
