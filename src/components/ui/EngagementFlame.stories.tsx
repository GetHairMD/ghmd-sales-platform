import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import EngagementFlame from './EngagementFlame';

const LEVELS = ['none', 'low', 'medium', 'high'] as const;

const meta = {
  title: 'Foundation/EngagementFlame',
  component: EngagementFlame,
  parameters: { layout: 'centered' },
  args: { level: 'high', showLabel: true },
  argTypes: { level: { control: 'inline-radio', options: LEVELS } },
} satisfies Meta<typeof EngagementFlame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hot: Story = { args: { level: 'high' } };
export const Warm: Story = { args: { level: 'medium' } };
export const Low: Story = { args: { level: 'low' } };
export const None: Story = { args: { level: 'none' } };

export const Scale: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      {LEVELS.map((l) => (
        <EngagementFlame key={l} level={l} showLabel />
      ))}
    </div>
  ),
};
