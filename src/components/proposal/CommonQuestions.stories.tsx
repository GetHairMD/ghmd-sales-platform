import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import CommonQuestions from './CommonQuestions'

const meta = {
  title: 'Proposal/CommonQuestions',
  component: CommonQuestions,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CommonQuestions>

export default meta
type Story = StoryObj<typeof meta>

// Always expanded — no collapse affordance (spec §6.17).
export const Default: Story = {}
