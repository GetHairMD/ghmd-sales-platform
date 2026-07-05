import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ConfidentialTopBar from './ConfidentialTopBar'

const meta = {
  title: 'Proposal/ConfidentialTopBar',
  component: ConfidentialTopBar,
  parameters: { layout: 'fullscreen' },
  args: { name: 'Dr. Elena Marchetti' },
} satisfies Meta<typeof ConfidentialTopBar>

export default meta
type Story = StoryObj<typeof meta>

export const Named: Story = {}
export const NullName: Story = { args: { name: null } }
