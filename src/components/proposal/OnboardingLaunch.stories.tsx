import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import OnboardingLaunch from './OnboardingLaunch'

const meta = {
  title: 'Proposal/OnboardingLaunch',
  component: OnboardingLaunch,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OnboardingLaunch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
