import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import FourColumnField from './FourColumnField';

const meta = {
  title: 'Composite/FourColumnField',
  component: FourColumnField,
  parameters: { layout: 'padded' },
  args: { label: 'Motivation authenticity' },
} satisfies Meta<typeof FourColumnField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighConfidence: Story = {
  args: { value: 'Strong — cited 3 unprompted growth goals', source: 'transcript', confidence: 'high', notes: '02:14–03:40' },
};
export const LowConfidenceBlocking: Story = {
  args: { value: 'Unclear', source: 'transcript', confidence: 'low', notes: 'Audio dropout; re-review required' },
};
export const Pending: Story = { args: { pending: true } };

export const ReviewQueue: Story = {
  render: () => (
    <div style={{ width: 560 }}>
      <FourColumnField label="Coachability" value="Open to protocol" source="transcript" confidence="high" notes="11:02" />
      <FourColumnField label="Chemistry / fit" pending />
      <FourColumnField label="Financial readiness" value="Unclear" source="transcript" confidence="low" notes="Needs Tier 2" />
    </div>
  ),
};
