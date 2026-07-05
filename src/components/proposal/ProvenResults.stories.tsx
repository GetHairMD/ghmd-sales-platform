import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ProvenResults from './ProvenResults'

const meta = {
  title: 'Proposal/ProvenResults',
  component: ProvenResults,
  parameters: { layout: 'fullscreen' },
  args: { slug: 'san-rafael-demo' },
} satisfies Meta<typeof ProvenResults>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
