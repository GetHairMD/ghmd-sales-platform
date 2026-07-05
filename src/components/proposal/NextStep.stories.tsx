import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import NextStep from './NextStep'

const meta = {
  title: 'Proposal/NextStep',
  component: NextStep,
  parameters: { layout: 'fullscreen' },
  args: {
    slug: 'san-rafael-demo',
    firstDisplay: 'Dr. Marchetti',
    territoryName: 'San Rafael, CA',
    calendlyUrl: null,
  },
} satisfies Meta<typeof NextStep>

export default meta
type Story = StoryObj<typeof meta>

// calendlyUrl null → scheduler placeholder (content-pending, spec §10).
export const Default: Story = {}
export const NullTerritory: Story = { args: { territoryName: null, firstDisplay: 'there' } }
