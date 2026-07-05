import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Investment from './Investment'
import { mockProposal } from './__fixtures__/mockProposal'

const meta = {
  title: 'Proposal/Investment',
  component: Investment,
  parameters: { layout: 'fullscreen' },
  args: { proposal: mockProposal },
} satisfies Meta<typeof Investment>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
