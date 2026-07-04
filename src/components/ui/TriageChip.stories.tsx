import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import TriageChip from './TriageChip';

const meta = {
  title: 'Foundation/TriageChip',
  component: TriageChip,
  parameters: { layout: 'centered' },
  args: { fit: 'proceed' },
  argTypes: {
    fit: { control: 'inline-radio', options: ['proceed', 'conditional', 'pass', null] },
  },
} satisfies Meta<typeof TriageChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Proceed: Story = { args: { fit: 'proceed' } };
export const Conditional: Story = { args: { fit: 'conditional' } };
export const Pass: Story = { args: { fit: 'pass' } };
export const NoTriage: Story = { args: { fit: null } };

export const WithEvidence: Story = {
  args: {
    fit: 'conditional',
    evidence: (
      <div>
        <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Why conditional</p>
        <p className="mt-1">Strong motivation and capital, but reference calls incomplete. Click a signal to open its transcript span.</p>
      </div>
    ),
  },
};
