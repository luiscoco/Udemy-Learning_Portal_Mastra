import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ExecutionRequestSchema,
  type ApprovalDecision,
  redactSecrets,
  type ExecutionEvent,
  type ExecutionEventPayload,
  type RunSnapshot,
  type RunStatus,
  type RunTerminalStatus,
  type RuntimeMode,
  type ValidationResult,
} from '@mlp/contracts';
import { LabError, RunAbortedError, toCanonicalError, zodDetails } from './errors.js';
import type { LabRegistry } from './registry.js';
import {
  silentLogger,
  type ApprovalOutcome,
  type ApprovalRequest,
  type EngineLogger,
  type ResultExtras,
  type RunContext,
} from './types.js';
import { redactValue } from './util.js';
import type { RunPersistence } from './persistence.js';

export interface RunnerOptions<S> {
  registry: LabRegistry<S>;
  services: S;
  /**
   * Per-run services for the run's owner (tenant isolation). Without it every run gets `services`.
   * Called once per run with the owner from StartMeta (null when the run has none).
   */
  servicesFor?: (ownerId: string | null) => S;
  /** true when the server allows live provider calls (MASTRA_MODE=live). */
  liveEnabled: boolean;
  maxConcurrentRuns?: number;
  /** Server-wide hard cap applied on top of each lab's maxTimeoutMs. */
  serverMaxTimeoutMs?: number;
  disconnectGraceMs?: number;
  /** How long a run may wait for a human approval before it is auto-declined (default 5 min). */
  approvalTimeoutMs?: number;
  /** Max runs that may wait for a human at once; further requests are auto-declined (default 20). */
  maxPendingApprovals?: number;
  retentionMs?: number;
  maxEventsPerRun?: number;
  /** Secret values to redact from events and logs. */
  secrets?: readonly string[];
  logger?: EngineLogger;
  now?: () => number;
  /** Optional server-owned durable journal. No lab code is executed during recovery. */
  persistence?: RunPersistence;
}

export interface StartMeta {
  requestId?: string;
  correlationId?: string;
  /** The authenticated learner who started the run (the API binds every run to its owner). */
  ownerId?: string;
}

type Listener = (event: ExecutionEvent) => void;

interface RunRecord {
  id: string;
  /** Original capability hash plus at most four recovery hashes; never in public snapshots/events. */
  tokenHashes: readonly string[];
  /** Owner (authenticated principal) of the run; never in snapshots or events. */
  ownerId: string | null;
  labId: string;
  correlationId: string;
  requestId: string;
  mode: RuntimeMode;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  deadlineMs: number;
  events: ExecutionEvent[];
  listeners: Set<Listener>;
  controller: AbortController;
  truncated: boolean;
  graceTimer?: NodeJS.Timeout;
  /** Deadline bookkeeping: the clock is paused while approvals are pending. */
  deadlineTimer?: NodeJS.Timeout;
  deadlineAt: number;
  remainingMs: number;
  /** Pending approvals: approvalId → settle function. */
  approvals: Map<string, (outcome: Omit<ApprovalOutcome, 'approvalId'>) => void>;
  extras: ResultExtras;
  done: Promise<void>;
}

const TERMINAL: Record<RunTerminalStatus, true> = { succeeded: true, failed: true, cancelled: true, timeout: true };

export class LabRunner<S = unknown> {
  private readonly runs = new Map<string, RunRecord>();
  private readonly opts: Required<Omit<RunnerOptions<S>, 'secrets' | 'logger' | 'now' | 'servicesFor' | 'persistence'>> & {
    servicesFor?: (ownerId: string | null) => S;
    secrets: readonly string[];
    logger: EngineLogger;
    now: () => number;
    persistence?: RunPersistence;
  };
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(options: RunnerOptions<S>) {
    this.opts = {
      maxConcurrentRuns: 4,
      serverMaxTimeoutMs: 120_000,
      disconnectGraceMs: 5_000,
      approvalTimeoutMs: 300_000,
      maxPendingApprovals: 20,
      retentionMs: 10 * 60_000,
      maxEventsPerRun: 5_000,
      secrets: [],
      logger: silentLogger,
      now: Date.now,
      ...options,
    };
    this.sweepTimer = setInterval(() => {
      try {
        this.sweep();
      } catch {
        this.opts.logger.error('Run storage maintenance failed; check the journal.');
      }
    }, 60_000);
    this.sweepTimer.unref();
  }

  /** Runs doing work. Runs paused for a human approval are excluded (they only hold memory). */
  get activeCount(): number {
    let n = 0;
    for (const r of this.runs.values()) if (r.status === 'running' && r.approvals.size === 0) n++;
    return n;
  }

  /** Runs currently paused waiting for a human approval. */
  get waitingCount(): number {
    let n = 0;
    for (const r of this.runs.values()) if (r.status === 'running' && r.approvals.size > 0) n++;
    return n;
  }

  /**
   * Checks the run token presented by an API caller (constant-time). Throws NOT_FOUND for an unknown
   * run, FORBIDDEN for a missing or wrong token. In-process callers (tests, shutdown) skip this.
   */
  authorize(runId: string, token: string | undefined): void {
    const record = this.record(runId);
    if (!record) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    const a = createHash('sha256')
      .update(token ?? '')
      .digest();
    let matched = 0;
    for (const hash of record.tokenHashes) matched |= Number(timingSafeEqual(a, Buffer.from(hash, 'hex')));
    if (!matched) {
      throw new LabError('FORBIDDEN', 'This action needs the run token returned when the run was started (X-Run-Token header).');
    }
  }

  /**
   * Validates and starts a run. Throws LabError (NOT_FOUND, VALIDATION_FAILED, NOT_CONFIGURED,
   * TOO_MANY_REQUESTS) synchronously; execution continues asynchronously.
   */
  start(labId: string, rawRequest: unknown, meta: StartMeta = {}): RunSnapshot & { runToken: string } {
    const lab = this.opts.registry.require(labId);
    const def = lab.definition;

    const req = ExecutionRequestSchema.safeParse(rawRequest);
    if (!req.success) {
      throw new LabError('VALIDATION_FAILED', 'Invalid execution request', { details: zodDetails(req.error) });
    }
    const { mode, timeoutMs } = req.data;
    if (mode === 'live') {
      if (!def.execution.modes.includes('live')) {
        throw new LabError('NOT_CONFIGURED', `${def.id} runs offline only; switch the run mode to "offline".`);
      }
      if (!this.opts.liveEnabled) {
        throw new LabError(
          'NOT_CONFIGURED',
          'Live mode is disabled on this server. Set MASTRA_MODE=live and a provider API key in .env, then restart the API.',
        );
      }
    } else if (!def.execution.modes.includes('offline')) {
      throw new LabError('NOT_CONFIGURED', `${def.id} requires live mode.`);
    }

    const input = lab.inputSchema.safeParse(req.data.input);
    if (!input.success) {
      throw new LabError('VALIDATION_FAILED', 'Input does not match the lab schema', {
        details: zodDetails(input.error).map((d) => ({ ...d, path: d.path === '(root)' ? 'input' : `input.${d.path}` })),
      });
    }

    if (this.activeCount >= this.opts.maxConcurrentRuns) {
      throw new LabError(
        'TOO_MANY_REQUESTS',
        `Too many active runs (max ${this.opts.maxConcurrentRuns}). Wait for one to finish.`,
        {
          retryable: true,
        },
      );
    }

    const deadlineMs = Math.min(
      timeoutMs ?? def.execution.defaultTimeoutMs,
      def.execution.maxTimeoutMs,
      this.opts.serverMaxTimeoutMs,
    );
    const requestId = meta.requestId ?? randomUUID();
    this.sweep();
    const runToken = randomBytes(32).toString('base64url');
    const record: RunRecord = {
      id: randomUUID(),
      tokenHashes: [createHash('sha256').update(runToken).digest('hex')],
      ownerId: meta.ownerId ?? null,
      labId: def.id,
      correlationId: meta.correlationId ?? requestId,
      requestId,
      mode,
      status: 'running',
      startedAt: this.opts.now(),
      deadlineMs,
      events: [],
      listeners: new Set(),
      controller: new AbortController(),
      truncated: false,
      deadlineAt: 0,
      remainingMs: deadlineMs,
      approvals: new Map(),
      extras: {},
      done: Promise.resolve(),
    };
    const evicted = this.opts.persistence?.create({
      ownerId: record.ownerId,
      tokenHashes: record.tokenHashes,
      snapshot: this.snapshot(record),
    });
    for (const id of evicted ?? []) if (this.runs.get(id)?.status !== 'running') this.runs.delete(id);
    this.runs.set(record.id, record);
    this.opts.logger.info('run started', {
      runId: record.id,
      labId: def.id,
      mode,
      requestId,
      correlationId: record.correlationId,
      deadlineMs,
    });
    record.done = this.execute(record, input.data);
    return { ...this.snapshot(record), runToken };
  }

  private async execute(record: RunRecord, input: unknown): Promise<void> {
    const lab = this.opts.registry.require(record.labId);
    const { signal } = record.controller;
    this.armDeadline(record);
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
    aborted.catch(() => {}); // handled via race below

    const ctx: RunContext<S> = {
      runId: record.id,
      correlationId: record.correlationId,
      requestId: record.requestId,
      labId: record.labId,
      mode: record.mode,
      signal,
      get deadline() {
        return record.approvals.size > 0 ? Number.POSITIVE_INFINITY : record.deadlineAt;
      },
      services: this.opts.servicesFor ? this.opts.servicesFor(record.ownerId) : this.opts.services,
      emit: (e) => {
        if (e.type === 'complete' || e.type === 'result' || e.type === 'error') {
          throw new Error('Labs must not emit result/error/complete; return a value or throw instead');
        }
        this.push(record, e);
      },
      log: (level, message, data) => this.push(record, { type: 'log', level, message, ...(data === undefined ? {} : { data }) }),
      setResultExtras: (extras) => {
        record.extras = { ...record.extras, ...extras };
      },
      throwIfAborted: () => {
        if (signal.aborted) throw signal.reason;
      },
      requestApproval: (request) => this.requestApproval(record, request),
    };

    try {
      const raw = await Promise.race([lab.run(ctx, input), aborted]);
      if (signal.aborted) throw signal.reason;
      let output: unknown = raw;
      if (lab.outputSchema) {
        const parsed = lab.outputSchema.safeParse(raw);
        if (!parsed.success) {
          throw new LabError('VALIDATION_FAILED', 'Lab output did not match its declared schema', {
            details: zodDetails(parsed.error),
          });
        }
        output = parsed.data;
      }
      let validation: ValidationResult | undefined;
      if (lab.validate) {
        validation = await Promise.race([
          Promise.resolve(lab.validate(output, input, { events: record.events, mode: record.mode })),
          aborted,
        ]);
      }
      this.push(record, {
        type: 'result',
        output,
        ...(validation ? { validation } : {}),
        ...(record.extras.usage ? { usage: record.extras.usage } : {}),
        ...(record.extras.effective ? { effective: record.extras.effective } : {}),
        ...(record.extras.annotations ? { annotations: record.extras.annotations } : {}),
      });
      this.finish(record, 'succeeded');
    } catch (thrown) {
      const err = signal.aborted ? signal.reason : thrown;
      const canonical = toCanonicalError(err, this.opts.secrets);
      if (canonical.code === 'INTERNAL') {
        const raw = thrown instanceof Error ? thrown.message : String(thrown);
        this.opts.logger.error('lab threw an unexpected error', {
          runId: record.id,
          labId: record.labId,
          error: redactSecrets(raw, this.opts.secrets),
        });
      }
      const status: RunTerminalStatus =
        err instanceof RunAbortedError ? (err.kind === 'timeout' ? 'timeout' : 'cancelled') : 'failed';
      try {
        this.push(record, {
          type: 'error',
          code: canonical.code,
          message: canonical.message,
          retryable: canonical.retryable,
          ...(canonical.details ? { details: canonical.details } : {}),
        });
        this.finish(record, status);
      } catch {
        // Storage itself may be unavailable. Stop safely without recursively trying to persist failure.
        this.push(
          record,
          {
            type: 'error',
            code: 'NOT_CONFIGURED',
            retryable: false,
            message: 'Run storage failed. Actions may already have occurred. Verify before starting another execution.',
          },
          false,
        );
        this.finish(record, 'failed', false);
      }
    } finally {
      clearTimeout(record.deadlineTimer);
      if (record.graceTimer) clearTimeout(record.graceTimer);
    }
  }

  private armDeadline(record: RunRecord): void {
    record.deadlineAt = this.opts.now() + record.remainingMs;
    record.deadlineTimer = setTimeout(() => record.controller.abort(new RunAbortedError('timeout')), record.remainingMs);
  }

  private pauseDeadline(record: RunRecord): void {
    clearTimeout(record.deadlineTimer);
    record.deadlineTimer = undefined;
    record.remainingMs = Math.max(0, record.deadlineAt - this.opts.now());
  }

  private requestApproval(record: RunRecord, request: ApprovalRequest): Promise<ApprovalOutcome> {
    const { signal } = record.controller;
    if (signal.aborted) return Promise.reject(signal.reason);
    const approvalId = randomUUID();
    const timeoutMs = this.opts.approvalTimeoutMs;
    if (record.approvals.size === 0 && this.waitingCount >= this.opts.maxPendingApprovals) {
      // Fail safe: never wait beyond the cap; decline so the side effect does not run.
      const reason = `The server is already waiting on ${this.opts.maxPendingApprovals} approvals; try again shortly.`;
      this.push(record, {
        type: 'approval-request',
        approvalId,
        toolName: request.toolName,
        args: request.args,
        message: request.message,
        expiresAt: new Date(this.opts.now()).toISOString(),
      });
      this.push(record, { type: 'approval-resolved', approvalId, decision: 'decline', by: 'limit', reason });
      this.opts.logger.warn('approval capacity reached', {
        runId: record.id,
        maxPendingApprovals: this.opts.maxPendingApprovals,
      });
      return Promise.resolve({ approvalId, decision: 'decline', by: 'limit', reason });
    }
    if (record.approvals.size === 0) this.pauseDeadline(record);
    return new Promise<ApprovalOutcome>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(expiry);
        signal.removeEventListener('abort', onAbort);
        record.approvals.delete(approvalId);
        if (record.approvals.size === 0 && !signal.aborted && record.status === 'running') this.armDeadline(record);
      };
      const settle = (outcome: Omit<ApprovalOutcome, 'approvalId'>) => {
        if (!record.approvals.has(approvalId)) return;
        record.approvals.delete(approvalId); // before the event, so snapshots/listeners see it resolved
        this.push(record, {
          type: 'approval-resolved',
          approvalId,
          decision: outcome.decision,
          by: outcome.by,
          ...(outcome.reason ? { reason: outcome.reason } : {}),
        });
        cleanup();
        resolve({ approvalId, ...outcome });
      };
      const onAbort = () => {
        cleanup();
        reject(signal.reason);
      };
      const expiry = setTimeout(
        () => settle({ decision: 'decline', reason: 'Nobody answered before the approval timeout', by: 'timeout' }),
        timeoutMs,
      );
      expiry.unref?.();
      signal.addEventListener('abort', onAbort, { once: true });
      record.approvals.set(approvalId, settle);
      this.push(record, {
        type: 'approval-request',
        approvalId,
        toolName: request.toolName,
        args: request.args,
        message: request.message,
        expiresAt: new Date(this.opts.now() + timeoutMs).toISOString(),
      });
    });
  }

  /**
   * Records a human decision for a pending approval. Throws NOT_FOUND for an unknown run and CONFLICT
   * when the run has finished or the approval is unknown or already resolved (first decision wins).
   */
  resolveApproval(runId: string, approvalId: string, decision: ApprovalDecision, reason?: string): RunSnapshot {
    const record = this.record(runId);
    if (!record) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    const settle = record.status === 'running' ? record.approvals.get(approvalId) : undefined;
    if (!settle)
      throw new LabError('CONFLICT', 'This approval is not pending (already decided, expired, or the run has finished).');
    settle({ decision, by: 'user', ...(reason ? { reason } : {}) });
    this.opts.logger.info('approval resolved', { runId, approvalId, decision });
    return this.snapshot(record);
  }

  private push(record: RunRecord, payload: ExecutionEventPayload, persist = true): ExecutionEvent | undefined {
    if (record.status !== 'running') return; // nothing after the terminal event
    const isTerminalish = payload.type === 'result' || payload.type === 'error' || payload.type === 'complete';
    if (!isTerminalish && record.events.length >= this.opts.maxEventsPerRun) {
      if (record.truncated) return;
      record.truncated = true;
      payload = {
        type: 'log',
        level: 'warn',
        message: `Event limit (${this.opts.maxEventsPerRun}) reached; further progress events are dropped.`,
        annotations: { truncated: true },
      };
    }
    const event = {
      ...redactValue(payload, this.opts.secrets),
      runId: record.id,
      correlationId: record.correlationId,
      seq: record.events.length,
      timestamp: new Date(this.opts.now()).toISOString(),
    } as ExecutionEvent;
    if (persist && this.opts.persistence) {
      const snapshot = {
        ...this.snapshot(record),
        eventCount: record.events.length + 1,
        ...(event.type === 'complete' ? { status: event.status, finishedAt: event.timestamp, pendingApprovals: 0 } : {}),
      };
      try {
        this.opts.persistence.append(record.id, event, snapshot);
      } catch {
        const error = new LabError(
          'NOT_CONFIGURED',
          'Run storage failed. Actions may already have occurred; verify before repeating.',
        );
        record.controller.abort(error);
        throw error;
      }
    }
    record.events.push(event);
    for (const l of [...record.listeners]) {
      try {
        l(event);
      } catch (err) {
        this.opts.logger.warn('event listener failed', { runId: record.id, error: String(err) });
      }
    }
    return event;
  }

  private finish(record: RunRecord, status: RunTerminalStatus, persist = true): void {
    if (record.status !== 'running') return;
    const durationMs = this.opts.now() - record.startedAt;
    const complete = this.push(record, { type: 'complete', status, durationMs }, persist);
    record.status = status;
    record.finishedAt = complete ? Date.parse(complete.timestamp) : this.opts.now();
    record.listeners.clear();
    this.opts.logger.info('run finished', { runId: record.id, labId: record.labId, status, durationMs });
  }

  /**
   * Subscribes to a run: replays buffered events with seq > afterSeq synchronously, then live events.
   * Returns an unsubscribe function. When the last subscriber of an active run leaves, the run is
   * aborted after the disconnect grace period unless someone resubscribes.
   */
  subscribe(runId: string, listener: Listener, afterSeq = -1): () => void {
    const record = this.record(runId);
    if (!record) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    if (record.graceTimer) {
      clearTimeout(record.graceTimer);
      record.graceTimer = undefined;
    }
    for (const e of record.events) if (e.seq > afterSeq) listener(e);
    if (record.status !== 'running') return () => {};
    record.listeners.add(listener);
    return () => {
      if (!record.listeners.delete(listener)) return;
      if (record.listeners.size === 0 && record.status === 'running') {
        record.graceTimer = setTimeout(() => {
          if (record.listeners.size === 0 && record.status === 'running') {
            this.opts.logger.info('aborting run after client disconnect', { runId: record.id });
            record.controller.abort(new RunAbortedError('disconnected'));
          }
        }, this.opts.disconnectGraceMs);
        record.graceTimer.unref?.();
      }
    };
  }

  cancel(runId: string): RunSnapshot {
    const record = this.record(runId);
    if (!record) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    if (record.status === 'running') record.controller.abort(new RunAbortedError('cancelled'));
    return this.snapshot(record);
  }

  /** The owner a run was started for, null when it was started without one, undefined for an unknown run. */
  ownerOf(runId: string): string | null | undefined {
    return this.record(runId)?.ownerId;
  }

  get(runId: string): RunSnapshot | undefined {
    const record = this.record(runId);
    return record ? this.snapshot(record) : undefined;
  }

  events(runId: string): readonly ExecutionEvent[] {
    return this.record(runId)?.events ?? [];
  }

  /** Resolves when the run has emitted its terminal event (for tests and graceful shutdown). */
  async waitFor(runId: string): Promise<RunSnapshot> {
    const record = this.record(runId);
    if (!record) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    await record.done;
    return this.snapshot(record);
  }

  listenerCount(runId: string): number {
    return this.runs.get(runId)?.listeners.size ?? 0;
  }

  sweep(now = this.opts.now()): number {
    let removed = 0;
    for (const id of this.opts.persistence?.prune(now) ?? []) {
      if (this.runs.get(id)?.status !== 'running' && this.runs.delete(id)) removed++;
    }
    for (const [id, r] of this.runs) {
      if (r.status !== 'running' && r.finishedAt !== undefined && now - r.finishedAt > this.opts.retentionMs) {
        this.runs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** Aborts all active runs and stops background timers. */
  async dispose(): Promise<void> {
    clearInterval(this.sweepTimer);
    const pending: Promise<void>[] = [];
    for (const r of this.runs.values()) {
      if (r.status === 'running') {
        r.controller.abort(new RunAbortedError('cancelled'));
        pending.push(r.done);
      }
    }
    await Promise.all(pending);
    this.opts.persistence?.close();
  }

  /** Trusted API boundary must enforce ownership before issuing a recovery capability. */
  recoverToken(runId: string): string {
    const record = this.record(runId);
    if (!record) throw new LabError('NOT_FOUND', 'Unknown run');
    const token = randomBytes(32).toString('base64url');
    const hashes = [
      record.tokenHashes[0]!,
      ...record.tokenHashes.slice(1).slice(-3),
      createHash('sha256').update(token).digest('hex'),
    ];
    this.opts.persistence?.capabilities(runId, hashes);
    record.tokenHashes = hashes;
    return token;
  }

  recent(ownerId: string, labId: string): RunSnapshot[] {
    const snapshots = new Map((this.opts.persistence?.list(ownerId, labId) ?? []).map((s) => [s.runId, s]));
    for (const r of this.runs.values()) if (r.ownerId === ownerId && r.labId === labId) snapshots.set(r.id, this.snapshot(r));
    return [...snapshots.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10);
  }

  private record(runId: string): RunRecord | undefined {
    this.opts.persistence?.assertHealthy();
    const live = this.runs.get(runId);
    if (live) return live;
    const stored = this.opts.persistence?.load(runId);
    if (!stored) return undefined;
    const s = stored.snapshot;
    if (s.status === 'running') throw new LabError('NOT_CONFIGURED', 'Execution is not attached to this runner.');
    const record: RunRecord = {
      id: s.runId,
      tokenHashes: stored.tokenHashes,
      ownerId: stored.ownerId,
      labId: s.labId,
      correlationId: s.correlationId,
      requestId: s.correlationId,
      mode: s.mode,
      status: s.status,
      startedAt: Date.parse(s.startedAt),
      finishedAt: Date.parse(s.finishedAt!),
      deadlineMs: s.deadlineMs,
      events: [...stored.events],
      listeners: new Set(),
      controller: new AbortController(),
      truncated: false,
      deadlineAt: 0,
      remainingMs: 0,
      approvals: new Map(),
      extras: {},
      done: Promise.resolve(),
    };
    this.runs.set(runId, record);
    return record;
  }

  private snapshot(r: RunRecord): RunSnapshot {
    return {
      runId: r.id,
      labId: r.labId,
      correlationId: r.correlationId,
      status: r.status,
      mode: r.mode,
      startedAt: new Date(r.startedAt).toISOString(),
      ...(r.finishedAt !== undefined ? { finishedAt: new Date(r.finishedAt).toISOString() } : {}),
      deadlineMs: r.deadlineMs,
      eventCount: r.events.length,
      pendingApprovals: r.status === 'running' ? r.approvals.size : 0,
    };
  }
}

export function isTerminalStatus(s: string): s is RunTerminalStatus {
  return s in TERMINAL;
}
