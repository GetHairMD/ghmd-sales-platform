import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Tabs, { type TabItem } from './Tabs';

const TABS: TabItem[] = [
  { key: 'action', label: 'Action' },
  { key: 'comms', label: 'Comms' },
  { key: 'calls', label: 'Calls' },
  { key: 'archive', label: 'Archive', disabled: true },
];

const meta = {
  title: 'Foundation/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
  args: { tabs: TABS, value: 'action', onValueChange: () => {} },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('action');
    return (
      <div style={{ width: 420 }}>
        <Tabs tabs={TABS} value={value} onValueChange={setValue} />
        <div className="p-4 font-body text-sm text-text">
          Active panel: <strong>{value}</strong> (Deal Room center workspace, PRD §3.2)
        </div>
      </div>
    );
  },
};
