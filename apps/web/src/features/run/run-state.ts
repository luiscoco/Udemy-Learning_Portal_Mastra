import type { ExecutionEvent, RunTerminalStatus, ValidationResult } from '@mlp/contracts';

export interface ToolCallView {
  toolCallId: string;
  toolName: string;
  args: unknown;
  status: 'running' | 'success' | 'error' | 'denied';
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface StepView {
  stepId: string;
  status: string;
  output?: unknown;
  durationMs?: number;
}

export interface RunError {
  code: string;
  message: string;
  retryable: boolean;
  details?: { path: string; message: string }[];
}

export interface RunState {
  phase: 'idle' | 'starting' | 'streaming' | 'finished';
  runId?: string;
  correlationId?: string;
  events: ExecutionEvent[];
  tokenText: string;
  tokenCount: number;
  tools: ToolCallView[];
  steps: StepView[];
  output?: unknown;
  validation?: ValidationResult;
  effective?: Record<string, unknown>;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  error?: RunError;
  terminal?: RunTerminalStatus;
  durationMs?: number;
}

export type RunAction =
  | { type: 'start' }
  | { type: 'started'; runId: string; correlationId: string }
  | { type: 'event'; event: ExecutionEvent }
  | { type: 'client-error'; error: RunError }
  | { type: 'reset' };

export const initialRunState: RunState = {
  phase: 'idle',
  events: [],
  tokenText: '',
  tokenCount: 0,
  tools: [],
  steps: [],
};

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'reset':
      return initialRunState;
    case 'start':
      return { ...initialRunState, phase: 'starting' };
    case 'started':
      return { ...state, phase: 'streaming', runId: action.runId, correlationId: action.correlationId };
    case 'client-error':
      return { ...state, phase: 'finished', error: action.error, terminal: state.terminal ?? 'failed' };
    case 'event': {
      const e = action.event;
      if (state.events.some((x) => x.seq === e.seq)) return state; // replayed after reconnect
      const next: RunState = { ...state, events: [...state.events, e] };
      switch (e.type) {
        case 'token':
          next.tokenText = state.tokenText + e.text;
          next.tokenCount = state.tokenCount + 1;
          break;
        case 'tool-start':
          next.tools = [...state.tools, { toolCallId: e.toolCallId, toolName: e.toolName, args: e.args, status: 'running' }];
          break;
        case 'tool-finish': {
          const found = state.tools.some((t) => t.toolCallId === e.toolCallId);
          const finished = {
            status: e.status,
            result: e.result,
            error: e.error,
            durationMs: e.durationMs,
          };
          next.tools = found
            ? state.tools.map((t) => (t.toolCallId === e.toolCallId ? { ...t, ...finished } : t))
            : [...state.tools, { toolCallId: e.toolCallId, toolName: e.toolName, args: undefined, ...finished }];
          break;
        }
        case 'workflow-step': {
          const view = { stepId: e.stepId, status: e.status, output: e.output, durationMs: e.durationMs };
          next.steps = state.steps.some((s) => s.stepId === e.stepId)
            ? state.steps.map((s) => (s.stepId === e.stepId ? { ...s, ...view, output: view.output ?? s.output } : s))
            : [...state.steps, view];
          break;
        }
        case 'result':
          next.output = e.output;
          next.validation = e.validation;
          next.effective = e.effective;
          next.usage = e.usage;
          break;
        case 'error':
          next.error = { code: e.code, message: e.message, retryable: e.retryable ?? false, details: e.details };
          break;
        case 'complete':
          next.phase = 'finished';
          next.terminal = e.status;
          next.durationMs = e.durationMs;
          break;
        default:
          break;
      }
      return next;
    }
  }
}
