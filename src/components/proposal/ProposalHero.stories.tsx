import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ProposalHero from './ProposalHero'
import { mockProposal } from './__fixtures__/mockProposal'

const meta = {
  title: 'Proposal/ProposalHero',
  component: ProposalHero,
  parameters: { layout: 'fullscreen' },
  args: { proposal: mockProposal },
} satisfies Meta<typeof ProposalHero>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithPracticeLogo: Story = {
  args: {
    proposal: {
      ...mockProposal,
      practice_logo_url: 'https://placehold.co/160x40/ffffff/040404?text=Practice',
    },
  },
}

export const SparseData: Story = {
  args: {
    proposal: {
      ...mockProposal,
      prospect_name_full: null,
      practice_name: null,
      specialty: null,
      territory_name: null,
      prepared_month: null,
    },
  },
}
