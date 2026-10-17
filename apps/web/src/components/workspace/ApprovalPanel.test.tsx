import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalPanel } from './ApprovalPanel';

const approval = {
  approvalId: 'a1',
  toolName: 'issueRefund',
  args: { orderId: 'ORD-1001', amountCents: 4500 },
  message: 'Refund €45.00 on ORD-1001. This moves money.',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  status: 'pending' as const,
};

describe('ApprovalPanel', () => {
  it('renders nothing without pending approvals', () => {
    const { container } = render(<ApprovalPanel approvals={[]} onDecide={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the call and sends the decision', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<ApprovalPanel approvals={[approval]} onDecide={onDecide} />);
    expect(screen.getByRole('region', { name: 'Approval needed: issueRefund' })).toBeInTheDocument();
    expect(screen.getByText(/Refund €45.00 on ORD-1001/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecide).toHaveBeenCalledWith('a1', 'approve');
  });

  it('shows a failed decision inline and re-enables the buttons', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('This approval is not pending'));
    render(<ApprovalPanel approvals={[approval]} onDecide={onDecide} />);
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This approval is not pending');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });
});
