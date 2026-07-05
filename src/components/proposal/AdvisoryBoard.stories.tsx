import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import AdvisoryBoard from './AdvisoryBoard'

const meta = {
  title: 'Proposal/AdvisoryBoard',
  component: AdvisoryBoard,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdvisoryBoard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
