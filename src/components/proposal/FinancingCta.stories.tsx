import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import FinancingCta from './FinancingCta'

const meta = {
  title: 'Proposal/FinancingCta',
  component: FinancingCta,
  parameters: { layout: 'fullscreen' },
  args: { slug: 'san-rafael-demo' },
} satisfies Meta<typeof FinancingCta>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
