import type {
  ApprovalDecision,
  ApprovalDecisionResponse,
  ExecutionEvent,
  ExecutionRequest,
  LabSourceResponse,
  PreflightResult,
  RunSnapshot,
  StartRunResponse,
} from '@mlp/contracts';
import { api } from './client';

export function startRun(labId: string, body: ExecutionRequest, signal?: AbortSignal): Promise<StartRunResponse> {
  return api.runs.start(labId, body, signal);
}

export const recoverRun = (runId: string, subject: string, signal?: AbortSignal) => api.runs.recover(runId, subject, signal);
export const fetchRecentRuns = (labId: string, subject: string, signal?: AbortSignal) => api.runs.recent(labId, subject, signal);

/** The run token (from startRun) proves this tab started the run; the API requires it for cancel and approvals. */
export function cancelRun(runId: string, runToken: string): Promise<RunSnapshot> {
  return api.runs.cancel(runId, runToken);
}

/** Approves or declines a tool call the run is waiting on. */
export function decideApproval(
  runId: string,
  runToken: string,
  approvalId: string,
  decision: ApprovalDecision,
): Promise<ApprovalDecisionResponse> {
  return api.runs.decide(runId, runToken, approvalId, decision);
}

export function fetchSource(labId: string, signal?: AbortSignal): Promise<LabSourceResponse> {
  return api.labs.source(labId, signal);
}

export function fetchPreflight(labId: string, signal?: AbortSignal): Promise<PreflightResult> {
  return api.labs.preflight(labId, signal);
}

/**
 * Streams run events until `complete`. Reconnects with Last-Event-ID on network drops.
 * Aborting `signal` closes the connection (the server cancels the run after its grace period).
 */
export function streamRunEvents(runId: string, onEvent: (event: ExecutionEvent) => void, signal: AbortSignal): Promise<void> {
  return api.runs.events(runId, onEvent, signal);
}
