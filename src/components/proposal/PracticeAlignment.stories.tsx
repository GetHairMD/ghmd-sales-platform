import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PracticeAlignment from './PracticeAlignment'

const meta = {
  title: 'Proposal/PracticeAlignment',
  component: PracticeAlignment,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PracticeAlignment>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
