import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PracticeOpportunity from './PracticeOpportunity'
import { mockProposal, mockPenetration } from './__fixtures__/mockProposal'

const meta = {
  title: 'Proposal/PracticeOpportunity',
  component: PracticeOpportunity,
  parameters: { layout: 'fullscreen' },
  args: {
    slug: 'san-rafael-demo',
    proposal: mockProposal,
    penetration: mockPenetration,
  },
} satisfies Meta<typeof PracticeOpportunity>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoPenetration: Story = {
  args: { penetration: [] },
}

export const MissingScenario: Story = {
  args: {
    proposal: { ...mockProposal, scenario_inputs: null, scenario_outputs: null },
  },
}
