import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ScarcityBanner from './ScarcityBanner'

const meta = {
  title: 'Proposal/ScarcityBanner',
  component: ScarcityBanner,
  parameters: { layout: 'fullscreen' },
  args: { territoryName: 'San Rafael, CA' },
} satisfies Meta<typeof ScarcityBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NullTerritory: Story = { args: { territoryName: null } }
