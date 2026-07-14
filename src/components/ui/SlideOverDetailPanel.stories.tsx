import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import SlideOverDetailPanel from './SlideOverDetailPanel'
import Button from './Button'

/**
 * SlideOverDetailPanel — right-side detail drawer (spec §4A primitive, introduced by
 * E-1). Interactive story: click to open, ESC / overlay / ✕ to close.
 */
const meta = {
  title: 'Foundation/SlideOverDetailPanel',
  component: SlideOverDetailPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SlideOverDetailPanel>

export default meta
type Story = StoryObj<typeof meta>

function Demo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Open detail</Button>
      <SlideOverDetailPanel
        open={open}
        onClose={() => setOpen(false)}
        title="Jordan Alvarez"
        subtitle="Rank #2 · Rep detail"
      >
        <dl className="space-y-4">
          <div>
            <dt className="font-heading text-xs uppercase tracking-caps text-text-muted">Deals closed</dt>
            <dd className="mt-0.5 text-2xl font-bold text-text">7</dd>
          </div>
          <div>
            <dt className="font-heading text-xs uppercase tracking-caps text-text-muted">Pipeline value</dt>
            <dd className="mt-0.5 text-2xl font-bold text-text">$1.4M</dd>
          </div>
          <div>
            <dt className="font-heading text-xs uppercase tracking-caps text-text-muted">Current streak</dt>
            <dd className="mt-0.5 text-2xl font-bold text-text">3 months</dd>
          </div>
        </dl>
      </SlideOverDetailPanel>
    </div>
  )
}

export const Default: Story = {
  args: { open: false, onClose: () => {}, title: 'Rep detail', children: null },
  render: () => <Demo />,
}
