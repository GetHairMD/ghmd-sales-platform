import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PlatformSection from './PlatformSection'

const meta = {
  title: 'Proposal/PlatformSection',
  component: PlatformSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PlatformSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
