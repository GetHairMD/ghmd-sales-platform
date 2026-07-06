import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Search } from 'lucide-react'
import Input from './Input'

const meta = {
  title: 'Foundation/Input',
  component: Input,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <Input placeholder="you@practice.com" />
    </div>
  ),
}

export const WithLeadingIcon: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <Input
        placeholder="Search prospects, territories…"
        leading={<Search className="h-4 w-4" aria-hidden="true" />}
      />
    </div>
  ),
}

export const Invalid: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <Input placeholder="you@practice.com" defaultValue="not-an-email" invalid />
    </div>
  ),
}
