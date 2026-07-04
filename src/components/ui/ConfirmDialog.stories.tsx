import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ConfirmDialog from './ConfirmDialog';
import Button from './Button';

const meta = {
  title: 'Foundation/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'centered' },
  args: { open: false, title: '', description: '', onConfirm: () => {}, onCancel: () => {} },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SoftTriageGate: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Advance to Proposal Sent</Button>
        <ConfirmDialog
          open={open}
          title="Triage not complete"
          description="This prospect has no completed Tier 2 triage. You can advance to Proposal Sent, but the deviation is recorded."
          records="Advancing sets a TRIAGE SKIPPED flag, visible on the card and Deal Room header."
          confirmLabel="Advance anyway"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </>
    );
  },
};

export const OpenStatic: Story = {
  args: {
    open: true,
    title: 'Funding pre-qual not cleared',
    description: 'Contract Sent normally follows a cleared lender pre-qual.',
    records: 'Advancing sets a PRE-QUAL SKIPPED flag on the record.',
    onConfirm: () => {},
    onCancel: () => {},
  },
};
