import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import SkipBadge from './SkipBadge';

const meta = {
  title: 'Foundation/SkipBadge',
  component: SkipBadge,
  parameters: { layout: 'centered' },
  args: { variant: 'prequal' },
  argTypes: { variant: { control: 'inline-radio', options: ['prequal', 'triage'] } },
} satisfies Meta<typeof SkipBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreQualSkipped: Story = { args: { variant: 'prequal' } };
export const TriageSkipped: Story = { args: { variant: 'triage' } };

export const Both: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <SkipBadge variant="prequal" />
      <SkipBadge variant="triage" />
    </div>
  ),
};
