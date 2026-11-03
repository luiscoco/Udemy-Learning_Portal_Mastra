import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { LabDefinition, RuntimeMode } from '@mlp/contracts';
import { fetchPreflight } from '../../api/runs';
import { completeAnswer, pendingApprovals } from '../../features/run/run-state';
import { useLabRun } from '../../features/run/useLabRun';
import { cn } from '../../lib/cn';
import { useProgressActions } from '../../lib/progress-actions';
import { useAsync } from '../../lib/use-async';
import { useSession } from '../../lib/auth-context';
import { Badge, Button, Card } from '../ui/primitives';
import { ApprovalPanel } from './ApprovalPanel';
import { ChatPanel } from './ChatPanel';
import { WorkflowGraph, visibleWorkflowsOf } from './WorkflowGraph';
import { VoiceTurn, voiceTurnOf } from './VoiceTurn';
import { AgentConversation, agentConversationOf } from './AgentConversation';
import { CitedAnswer, citedAnswerOf } from './CitedAnswer';
import { McpCapabilityMatrix, mcpCapabilitiesOf } from './McpCapabilityMatrix';
import { McpToolCatalog, mcpCatalogOf } from './McpToolCatalog';
import { EvalReport, evalReportOf } from './EvalReport';
import { ExperimentComparison, comparisonOf } from './ExperimentComparison';
import { QualityDashboard, dashboardOf } from './QualityDashboard';
import { ScoreCard, scoreCardOf } from './ScoreCard';
import { SpanTree, traceTreeOf } from './SpanTree';
import { DynamicForm } from './DynamicForm';
import {
  buildInput,
  initialRawValues,
  reconcile,
  serverDetailsToFieldErrors,
  type FieldErrors,
  type RawValues,
} from './form-model';
import { JsonView, RunTimeline, TraceView } from './RunTimeline';
import { Section } from './Section';

function Preflight({ labId }: { labId: string }) {
  const state = useAsync(`preflight:${labId}`, (signal) => fetchPreflight(labId, signal));
  if (state.status === 'loading') return <p className="text-sm text-fg-muted">Checking environment…</p>;
  if (state.status === 'error') {
    return (
      <div role="alert" className="text-sm text-danger">
        Preflight unavailable: {state.error.message}{' '}
        <Button variant="ghost" size="sm" onClick={state.retry}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Preflight checks">
      {state.data.checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <span aria-hidden="true" className={c.passed ? 'text-success' : 'text-fg-subtle'}>
            {c.passed ? '✓' : '○'}
          </span>
          <span>
            <span className="font-medium">{c.label}</span>
            <span className="sr-only">{c.passed ? ' — passed' : ' — not met'}</span>
            {c.message ? <span className="block text-xs text-fg-muted">{c.message}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_TEXT = {
  idle: 'Ready',
  starting: 'Starting run…',
  streaming: 'Running…',
} as const;

export function RunTab({ definition }: { definition: LabDefinition }) {
  const auth = useSession();
  const location = useLocation();
  const { state, run, cancel, decide, reset } = useLabRun(definition.id);
  const waiting = pendingApprovals(state);
  const cited = state.phase === 'finished' ? citedAnswerOf(state.output) : null;
  const mcpCatalog = state.phase === 'finished' ? mcpCatalogOf(state.output) : null;
  const mcpCapabilities = state.phase === 'finished' ? mcpCapabilitiesOf(state.output) : null;
  const conversation = state.phase === 'finished' ? agentConversationOf(state.output) : null;
  const traceTree = state.phase === 'finished' ? traceTreeOf(state.output) : null;
  const scoreCard = state.phase === 'finished' ? scoreCardOf(state.output) : null;
  const evalReport = state.phase === 'finished' ? evalReportOf(state.output) : null;
  const comparison = state.phase === 'finished' ? comparisonOf(state.output) : null;
  const dashboard = state.phase === 'finished' ? dashboardOf(state.output) : null;
  const { update } = useProgressActions(definition.id);
  const example = definition.exampleInput;
  const [raw, setRaw] = useState<RawValues>(() => reconcile(definition.inputs, initialRawValues(definition.inputs, example)));
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<RuntimeMode>(definition.execution.modes[0] ?? 'offline');
  const busy = state.phase === 'starting' || state.phase === 'streaming';
  const id = `${definition.id}-run`;

  const server = serverDetailsToFieldErrors(
    state.error?.code === 'VALIDATION_FAILED' ? state.error.details : undefined,
    definition.inputs,
  );
  const fieldErrors = { ...server.errors, ...clientErrors };

  const onRun = async () => {
    const { values, errors } = buildInput(definition.inputs, raw);
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const final = await run({ input: values, mode });
    if (final?.error?.code === 'UNAUTHORIZED') auth.invalidate();
    if (final?.terminal === 'succeeded') {
      const passed = final.validation?.passed === true;
      update((cur) => ({ runSucceeded: true, checksPassed: cur.checksPassed || passed }));
    }
  };

  const statusText =
    state.phase === 'finished'
      ? state.terminal === 'succeeded'
        ? `Run succeeded${state.validation ? (state.validation.passed ? ' — all checks passed' : ' — some checks failed') : ''}`
        : `Run ${state.terminal ?? 'failed'}`
      : waiting.length > 0
        ? 'Waiting for your approval…'
        : STATUS_TEXT[state.phase];

  if (auth.status === 'loading') return <p role="status">Checking your session…</p>;
  if (auth.status === 'error')
    return (
      <Card>
        <p role="alert">{auth.error}</p>
        <Button onClick={() => void auth.refresh()}>Retry session check</Button>
      </Card>
    );
  if (!auth.session?.authenticated || state.error?.code === 'UNAUTHORIZED')
    return (
      <Card>
        <h2 className="text-lg font-semibold">Sign in to run labs</h2>
        <p className="mt-2 text-sm text-fg-muted">Your session protects your runs and their output. Sign in to continue.</p>
        <Link
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        >
          Sign in to continue
        </Link>
      </Card>
    );
  if (definition.presentation === 'chat')
    return (
      <div className="flex flex-col gap-8">
        <Section title="Preflight" id={`${id}-preflight`}>
          <Preflight labId={definition.id} />
        </Section>
        <Section title="Chat" id={`${id}-chat`}>
          <ChatPanel definition={definition} />
        </Section>
      </div>
    );
  return (
    <div className="flex flex-col gap-8">
      <Section title="Preflight" id={`${id}-preflight`}>
        <Preflight labId={definition.id} />
      </Section>

      <Section title="Inputs" id={`${id}-inputs`}>
        <details className="rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Example input as JSON</summary>
          <div className="mt-2">
            <JsonView value={example} label="Example input" />
          </div>
        </details>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onRun();
          }}
          className="flex flex-col gap-6"
        >
          <DynamicForm
            fields={definition.inputs}
            values={raw}
            errors={fieldErrors}
            disabled={busy}
            idPrefix={id}
            onChange={(name, value) => {
              setRaw((r) => reconcile(definition.inputs, { ...r, [name]: value }));
              setClientErrors(({ [name]: _gone, ...rest }) => rest);
            }}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Run mode</legend>
            <div className="flex flex-wrap gap-4">
              {(['offline', 'live'] as const).map((m) => {
                const supported = definition.execution.modes.includes(m);
                return (
                  <label key={m} className={cn('flex items-center gap-2 text-sm', !supported && 'text-fg-subtle')}>
                    <input
                      type="radio"
                      name={`${id}-mode`}
                      value={m}
                      checked={mode === m}
                      disabled={!supported || busy}
                      onChange={() => setMode(m)}
                    />
                    {m === 'offline' ? 'Offline (deterministic mock, free)' : 'Live (real provider, may cost money)'}
                    {!supported ? <span className="text-xs">— not supported by this lab</span> : null}
                  </label>
                );
              })}
            </div>
            <p
              className={cn('text-sm', mode === 'live' ? 'font-medium text-warning' : 'text-fg-muted')}
              data-testid="cost-notice"
            >
              {mode === 'live' ? `Cost notice: ${definition.execution.costNotice}` : definition.execution.costNotice}
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Running…' : 'Run'}
            </Button>
            <Button variant="danger" disabled={!busy || !state.runId} onClick={() => void cancel()}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setRaw(reconcile(definition.inputs, initialRawValues(definition.inputs, example)));
                setClientErrors({});
                reset();
              }}
            >
              Reset to example
            </Button>
            <p role="status" aria-live="polite" className="text-sm font-medium" data-testid="run-status">
              {statusText}
            </p>
          </div>
          <p className="text-xs text-fg-subtle">
            Limits: timeout {definition.execution.defaultTimeoutMs / 1000}s
            {definition.execution.budget.maxSteps ? ` · max ${definition.execution.budget.maxSteps} steps` : ''}
            {definition.execution.budget.maxToolCalls ? ` · max ${definition.execution.budget.maxToolCalls} tool calls` : ''}
            {state.correlationId ? ` · correlation id ${state.correlationId}` : ''}
          </p>
        </form>
      </Section>

      {state.error ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-danger">
          <p className="font-semibold">
            {state.error.code}
            {state.error.retryable ? <Badge className="ml-2">retryable</Badge> : null}
          </p>
          <p className="mt-1 text-sm">{state.error.message}</p>
          {server.other.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {server.other.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ApprovalPanel approvals={waiting} onDecide={decide} />

      {state.workflowGraph ? (
        <Section title="Workflow" id={`${id}-workflow`}>
          <WorkflowGraph
            graph={state.workflowGraph}
            steps={state.steps}
            finished={state.phase === 'finished'}
            finalStatuses={(state.output as { statuses?: Record<string, string> } | undefined)?.statuses}
          />
        </Section>
      ) : null}
      {state.phase === 'finished' && voiceTurnOf(state.output) ? (
        <Section title="Voice turn" id={`${id}-voice`}>
          <VoiceTurn turn={voiceTurnOf(state.output)!} />
        </Section>
      ) : null}
      {state.phase === 'finished' && visibleWorkflowsOf(state.output) ? (
        <p className="text-sm" data-testid="visible-workflows">
          Workflows you can see:{' '}
          {visibleWorkflowsOf(state.output)!
            .map((w) => w.title)
            .join(', ') || 'none'}
        </p>
      ) : null}

      <Section title="Live output" id={`${id}-output`}>
        <Card className="min-h-20 p-4">
          {state.tokenText ? (
            <p className="whitespace-pre-wrap text-fg" data-testid="token-output">
              {state.tokenText}
              {state.phase === 'streaming' ? <span className="ml-0.5 animate-pulse">▍</span> : null}
            </p>
          ) : state.phase === 'finished' && completeAnswer(state.output) ? (
            <div className="flex flex-col gap-2" data-testid="complete-answer">
              <p className="text-xs text-fg-muted">
                No tokens were streamed: this lab returns the whole answer in one piece (for example with generate()), so it
                appears when the run finishes.
              </p>
              <p className="whitespace-pre-wrap text-fg">{completeAnswer(state.output)}</p>
            </div>
          ) : state.phase === 'finished' ? (
            <p className="text-sm text-fg-muted">This run did not stream any tokens. See the result and checks below.</p>
          ) : (
            <p className="text-sm text-fg-muted">
              Streamed tokens appear here while the lab runs. Labs that do not stream show their complete answer here when they
              finish.
            </p>
          )}
        </Card>
      </Section>

      <Section title="Event timeline" id={`${id}-timeline`}>
        <RunTimeline state={state} />
      </Section>

      <Section title="Agent, tool and workflow trace" id={`${id}-trace`}>
        <TraceView state={state} />
      </Section>

      {cited ? (
        <Section title="Answer with citations" id={`${id}-cited`}>
          <CitedAnswer data={cited} idPrefix={id} />
        </Section>
      ) : null}

      {mcpCatalog ? (
        <Section title="MCP tools" id={`${id}-mcp`}>
          <McpToolCatalog data={mcpCatalog} />
        </Section>
      ) : null}

      {dashboard ? (
        <Section title="Quality dashboard" id={`${id}-dashboard`}>
          <QualityDashboard data={dashboard} />
        </Section>
      ) : null}

      {comparison ? (
        <Section title="Experiment comparison" id={`${id}-comparison`}>
          <ExperimentComparison data={comparison} />
        </Section>
      ) : null}

      {evalReport ? (
        <Section title="Evaluation report" id={`${id}-eval-report`}>
          <EvalReport data={evalReport} />
        </Section>
      ) : null}

      {scoreCard ? (
        <Section title="Score card" id={`${id}-score-card`}>
          <ScoreCard data={scoreCard} />
        </Section>
      ) : null}

      {traceTree ? (
        <Section title="Trace spans" id={`${id}-trace-spans`}>
          <SpanTree data={traceTree} />
        </Section>
      ) : null}

      {conversation ? (
        <Section title="Agent conversation" id={`${id}-conversation`}>
          <AgentConversation data={conversation} />
        </Section>
      ) : null}

      {mcpCapabilities ? (
        <Section title="MCP capabilities" id={`${id}-mcp-capabilities`}>
          <McpCapabilityMatrix data={mcpCapabilities} />
        </Section>
      ) : null}

      <Section title="Result and automated checks" id={`${id}-result`}>
        {state.validation ? (
          <ul className="flex flex-col gap-1.5" aria-label="Automated checks" data-testid="checks">
            {state.validation.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className={c.passed ? 'text-success' : 'text-danger'}>
                  {c.passed ? '✓' : '✗'}
                </span>
                {/* min-w-0 + overflow-wrap:anywhere: check messages may hold long unbroken JSON */}
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {c.label}
                  <span className="sr-only">{c.passed ? ' — passed' : ' — failed'}</span>
                  {c.message ? <span className="ml-2 text-xs text-fg-muted">({c.message})</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Checks run automatically when a run completes.</p>
        )}
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <div>
            <p className="mb-1 text-sm font-medium">Output</p>
            <JsonView value={state.output} label="Run output" />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Expected output (example input)</p>
            <p className="mb-1 text-xs text-fg-muted">{definition.expectedOutput.description}</p>
            <JsonView value={definition.expectedOutput.example} label="Expected output" />
          </div>
        </div>
        {state.effective ? (
          <div>
            <p className="mb-1 text-sm font-medium">Effective options</p>
            <JsonView value={state.effective} label="Effective options" />
          </div>
        ) : null}
      </Section>
    </div>
  );
}
