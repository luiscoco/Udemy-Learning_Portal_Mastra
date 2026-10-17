import { Router } from 'express';
import { ApprovalDecisionRequestSchema, type ApprovalDecisionResponse, type ExecutionEvent } from '@mlp/contracts';
import { LabError, type LabRunner } from '@mlp/lab-engine';
import type { LabServices } from '@mlp/labs';

function parseAfter(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= -1 ? n : -1;
}

export function runsRouter(deps: { runner: LabRunner<LabServices>; heartbeatMs: number }): Router {
  const { runner, heartbeatMs } = deps;
  const router = Router();

  router.get('/:runId', (req, res) => {
    const snap = runner.get(req.params.runId);
    if (!snap) throw new LabError('NOT_FOUND', `Unknown run "${req.params.runId}"`);
    res.json(snap);
  });

  router.post('/:runId/cancel', (req, res) => {
    res.json(runner.cancel(req.params.runId));
  });

  /** Human decision for a pending approval (see ctx.requestApproval). 404 unknown run, 409 not pending. */
  router.post('/:runId/approvals/:approvalId', (req, res) => {
    const { runId, approvalId } = req.params;
    const body = ApprovalDecisionRequestSchema.parse(req.body ?? {});
    runner.resolveApproval(runId, approvalId, body.decision, body.reason);
    const response: ApprovalDecisionResponse = { runId, approvalId, decision: body.decision };
    res.json(response);
  });

  /** Server-Sent Events: replay (honouring Last-Event-ID or ?after=) then live, closing after `complete`. */
  router.get('/:runId/events', (req, res) => {
    const { runId } = req.params;
    if (!runner.get(runId)) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    const afterSeq = parseAfter(req.header('last-event-id') ?? req.query.after);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    // No manual `Connection` header: Node manages it. Forcing keep-alive on a response that may
    // end in the same tick (finished runs replay instantly) made proxies hang the stream.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 2000\n\n');

    let ended = false;
    // Holder, because replay inside subscribe() can call end() before subscribe returns.
    const sub: { off?: () => void } = {};
    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
    heartbeat.unref();

    const end = () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      sub.off?.();
      res.end();
    };

    const send = (event: ExecutionEvent) => {
      if (ended) return;
      res.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'complete') end();
    };

    // Client went away (tab closed, EventSource.close(), network drop).
    res.on('close', end);
    sub.off = runner.subscribe(runId, send, afterSeq);
    if (ended) sub.off();
  });

  return router;
}
