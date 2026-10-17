import type { ZodType } from 'zod';
import type {
  ApprovalDecision,
  CheckResult,
  ExecutionEvent,
  ExecutionEventPayload,
  LabDefinition,
  RuntimeMode,
  ValidationResult,
} from '@mlp/contracts';

export interface EngineLogger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export const silentLogger: EngineLogger = { debug() {}, info() {}, warn() {}, error() {} };

export interface ResultExtras {
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  /** Effective options actually used (model id, limits). Never include secrets. */
  effective?: Record<string, unknown>;
  annotations?: Record<string, string | number | boolean | null>;
}

export interface ApprovalRequest {
  toolName: string;
  args: unknown;
  /** What will happen if the human approves, in plain words. */
  message: string;
}

export interface ApprovalOutcome {
  approvalId: string;
  decision: ApprovalDecision;
  reason?: string;
  /** user = a person decided; timeout = nobody answered in time; limit = the server's waiting-run cap was reached. */
  by: 'user' | 'timeout' | 'limit';
}

/** Everything a lab implementation receives for one run. */
export interface RunContext<S = unknown> {
  readonly runId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly labId: string;
  readonly mode: RuntimeMode;
  readonly signal: AbortSignal;
  /** Epoch milliseconds after which the run is aborted with TIMEOUT (moves later while waiting for approvals). */
  readonly deadline: number;
  /** Server-side adapters (models, storage…). Never sent to the client. */
  readonly services: S;
  emit(event: ExecutionEventPayload): void;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void;
  /** Attach usage / effective options to the final result event. */
  setResultExtras(extras: ResultExtras): void;
  throwIfAborted(): void;
  /**
   * Pauses the run until a human approves or declines via the API (emits approval-request /
   * approval-resolved). The deadline clock stops while waiting; unanswered requests auto-decline after
   * the runner's approval timeout. Rejects with the abort reason if the run is cancelled meanwhile.
   */
  requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome>;
}

export interface PreflightEnv {
  serverMode: RuntimeMode;
  mastraVersion: string;
  /** Provider names with a configured key (names only, never values). */
  configuredProviders: string[];
}

export interface ValidateContext {
  events: readonly ExecutionEvent[];
  mode: RuntimeMode;
}

/** Server-side implementation of one lab. */
export interface LabImplementation<I = unknown, O = unknown, S = unknown> {
  definition: LabDefinition;
  inputSchema: ZodType<I>;
  outputSchema?: ZodType<O>;
  run(ctx: RunContext<S>, input: I): Promise<O>;
  validate?(output: O, input: I, ctx: ValidateContext): ValidationResult | Promise<ValidationResult>;
  preflight?(env: PreflightEnv): CheckResult[] | Promise<CheckResult[]>;
}

// Registries store heterogeneous labs; inputs are validated by each lab's own schema at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyLabImplementation<S = unknown> = LabImplementation<any, any, S>;
