import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import TerritoryAnalysis from './TerritoryAnalysis'
import { mockProposal } from './__fixtures__/mockProposal'

const meta = {
  title: 'Proposal/TerritoryAnalysis',
  component: TerritoryAnalysis,
  parameters: { layout: 'fullscreen' },
  args: { proposal: mockProposal },
} satisfies Meta<typeof TerritoryAnalysis>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoDemandMatrix: Story = {
  args: { proposal: { ...mockProposal, demand_matrix: null } },
}

export const NoPhoto: Story = {
  args: { proposal: { ...mockProposal, prospect_photo_url: null } },
}
