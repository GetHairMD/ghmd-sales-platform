import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PatientResults from './PatientResults'

const meta = {
  title: 'Proposal/PatientResults',
  component: PatientResults,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PatientResults>

export default meta
type Story = StoryObj<typeof meta>

// Claims-gated static shell (spec §10) — no efficacy figures.
export const Default: Story = {}
