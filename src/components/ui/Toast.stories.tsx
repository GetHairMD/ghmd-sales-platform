import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Toast from './Toast';

const meta = {
  title: 'Foundation/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
  args: { variant: 'success', title: 'Proposal published', message: 'The tokenized proposal URL is live and the prospect advanced to Proposal Sent.' },
  argTypes: { variant: { control: 'inline-radio', options: ['success', 'warning', 'error', 'info'] } },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = { args: { variant: 'success' } };
export const Warning: Story = { args: { variant: 'warning', title: 'Triage skipped', message: 'A TRIAGE SKIPPED flag was recorded on this deal.' } };
export const Error: Story = { args: { variant: 'error', title: 'Publish failed', message: 'Territory record missing — could not generate the proposal.' } };
export const Info: Story = { args: { variant: 'info', title: 'Tier 2 pending', message: 'Leif has 24h to confirm the pre-score.' } };
export const Dismissible: Story = { args: { onDismiss: () => {} } };
