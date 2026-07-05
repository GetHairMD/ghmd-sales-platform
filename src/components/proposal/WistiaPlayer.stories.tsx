import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import WistiaPlayer from './WistiaPlayer'

const meta = {
  title: 'Proposal/WistiaPlayer',
  component: WistiaPlayer,
  parameters: { layout: 'padded' },
  args: { slug: 'san-rafael-demo', mediaId: '', title: 'Video coming soon' },
} satisfies Meta<typeof WistiaPlayer>

export default meta
type Story = StoryObj<typeof meta>

// mediaId empty → placeholder frame (no external Wistia load in Storybook).
export const Pending: Story = {}
