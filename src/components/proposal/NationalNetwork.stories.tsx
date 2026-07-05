import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import NationalNetwork from './NationalNetwork'

const meta = {
  title: 'Proposal/NationalNetwork',
  component: NationalNetwork,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NationalNetwork>

export default meta
type Story = StoryObj<typeof meta>

// NETWORK_LOCATION_COUNT is null (pending) → number-free copy, no invented figure.
export const Default: Story = {}
