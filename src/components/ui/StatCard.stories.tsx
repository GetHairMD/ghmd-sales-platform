import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Flame, Users } from 'lucide-react'
import StatCard, { StatCardDelta } from './StatCard'

const meta = {
  title: 'Foundation/StatCard',
  component: StatCard,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 240 }}>
      <StatCard {...args} />
    </div>
  ),
} satisfies Meta<typeof StatCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Active prospects',
    value: 42,
    sublabel: 'Across 12 pipeline stages',
    icon: <Users className="h-4 w-4 text-text-muted" aria-hidden="true" />,
  },
}

export const Accent: Story = {
  args: {
    label: 'Hot leads · 7d',
    value: 6,
    sublabel: 'Trigger hits, last 7 days',
    accent: true,
    icon: <Flame className="h-4 w-4 text-accent" aria-hidden="true" />,
  },
}

/** Delta is optional and never fabricated — shown here only to document the pattern. */
export const WithDelta: Story = {
  args: { label: 'Pipeline value', value: '$1.2M' },
  render: () => (
    <div className="grid grid-cols-2 gap-4" style={{ width: 500 }}>
      <StatCardDelta
        label="Pipeline value"
        value="$1.2M"
        delta={{ direction: 'up', label: '+8%', period: 'vs last month' }}
      />
      <StatCardDelta
        label="Stalled deals"
        value={3}
        positiveIsGood={false}
        delta={{ direction: 'up', label: '+2', period: 'vs last month' }}
      />
    </div>
  ),
}
