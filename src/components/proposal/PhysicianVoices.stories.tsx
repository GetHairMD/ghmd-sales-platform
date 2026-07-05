import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PhysicianVoices from './PhysicianVoices'

const meta = {
  title: 'Proposal/PhysicianVoices',
  component: PhysicianVoices,
  parameters: { layout: 'fullscreen' },
  args: { slug: 'san-rafael-demo' },
} satisfies Meta<typeof PhysicianVoices>

export default meta
type Story = StoryObj<typeof meta>

// Media ids are content-pending (spec §10) → renders the "coming soon" frame.
export const Default: Story = {}
