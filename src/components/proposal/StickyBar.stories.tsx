import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import StickyBar from './StickyBar'

const meta = {
  title: 'Proposal/StickyBar',
  component: StickyBar,
  parameters: { layout: 'fullscreen' },
  args: { slug: 'san-rafael-demo', territoryName: 'San Rafael, CA' },
} satisfies Meta<typeof StickyBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NullTerritory: Story = { args: { territoryName: null } }
