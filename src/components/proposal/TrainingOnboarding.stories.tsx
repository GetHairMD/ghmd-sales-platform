import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import TrainingOnboarding from './TrainingOnboarding'

const meta = {
  title: 'Proposal/TrainingOnboarding',
  component: TrainingOnboarding,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TrainingOnboarding>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
