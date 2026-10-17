import { useState } from 'react';
import type { ApprovalDecision } from '@mlp/contracts';
import type { ApprovalView } from '../../features/run/run-state';
import { Button } from '../ui/primitives';
import { JsonView } from './RunTimeline';

function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: ApprovalView;
  onDecide: (approvalId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  const [sending, setSending] = useState<ApprovalDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingId = `approval-${approval.approvalId}`;
  const expires = new Date(approval.expiresAt).toLocaleTimeString();

  const send = async (decision: ApprovalDecision) => {
    setSending(decision);
    setError(null);
    try {
      await onDecide(approval.approvalId, decision);
      // The card disappears when the stream delivers approval-resolved.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your decision.');
      setSending(null);
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="approval-panel"
      className="flex flex-col gap-3 rounded-xl border-2 border-warning bg-warning-soft p-4"
    >
      <h3 id={headingId} className="text-base font-semibold text-fg">
        Approval needed: <span className="font-mono">{approval.toolName}</span>
      </h3>
      <p className="text-sm text-fg">{approval.message}</p>
      <div>
        <p className="mb-1 text-xs text-fg-muted">Arguments the model wants to use</p>
        <JsonView value={approval.args} label={`${approval.toolName} arguments awaiting approval`} />
      </div>
      <p className="text-xs text-fg-muted">
        The run is paused and its time limit is stopped. Without an answer it is declined automatically at {expires}.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button disabled={sending !== null} onClick={() => void send('approve')}>
          {sending === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
        <Button variant="danger" disabled={sending !== null} onClick={() => void send('decline')}>
          {sending === 'decline' ? 'Declining…' : 'Decline'}
        </Button>
      </div>
    </section>
  );
}

/** Pending human approvals for the current run (derived from approval-request / approval-resolved events). */
export function ApprovalPanel({
  approvals,
  onDecide,
}: {
  approvals: ApprovalView[];
  onDecide: (approvalId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  if (approvals.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {approvals.map((a) => (
        <ApprovalCard key={a.approvalId} approval={a} onDecide={onDecide} />
      ))}
    </div>
  );
}
