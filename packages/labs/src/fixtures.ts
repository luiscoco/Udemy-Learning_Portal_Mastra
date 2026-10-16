import type { ApiErrorCode, ExecutionEventType, RunTerminalStatus, RuntimeMode } from '@mlp/contracts';

/** A deterministic scenario every lab ships; the conformance suite executes all of them offline. */
export interface LabFixture {
  name: string;
  input: Record<string, unknown>;
  mode?: RuntimeMode;
  expect: {
    status: RunTerminalStatus;
    validationPassed?: boolean;
    errorCode?: ApiErrorCode;
    /** Partial match against the result output. */
    output?: unknown;
    /** Exact ordered list of event types, when the lab is fully deterministic. */
    eventTypes?: ExecutionEventType[];
  };
}
