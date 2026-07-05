import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import CalendlyEmbed from './CalendlyEmbed'

const meta = {
  title: 'Proposal/CalendlyEmbed',
  component: CalendlyEmbed,
  parameters: { layout: 'padded' },
  args: { slug: 'san-rafael-demo', calendlyUrl: null },
} satisfies Meta<typeof CalendlyEmbed>

export default meta
type Story = StoryObj<typeof meta>

// calendlyUrl null → placeholder (no external Calendly load in Storybook).
export const Pending: Story = {}
