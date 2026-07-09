import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import StagePill from './StagePill';
import { PIPELINE_STAGES } from '@/lib/pipeline-stages';

const meta = {
  title: 'Foundation/StagePill',
  component: StagePill,
  parameters: { layout: 'centered' },
  args: { stage: 5, showProgress: false },
  argTypes: { stage: { control: { type: 'number', min: 1, max: PIPELINE_STAGES.length } } },
} satisfies Meta<typeof StagePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithProgress: Story = { args: { showProgress: true } };
export const OutOfRange: Story = { args: { stage: 99 } };

export const AllStages: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
      {PIPELINE_STAGES.map((s) => (
        <StagePill key={s.id} stage={s.id} showProgress />
      ))}
    </div>
  ),
};
