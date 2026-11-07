import { useState } from 'react';
import { InputValuesSchema, type LabDefinition } from '@mlp/contracts';
import { useLabRun } from '../run/useLabRun';
import { completeAnswer, pendingApprovals } from '../run/run-state';
import { useSession } from '../../lib/auth-context';
import { api } from '../../api/client';
import { useAsync } from '../../lib/use-async';
import { ApprovalPanel } from '../../components/workspace/ApprovalPanel';
import { JsonView, RunTimeline, TraceView } from '../../components/workspace/RunTimeline';
import { FormattedResponse } from '../../components/workspace/FormattedResponse';
import { Button } from '../../components/ui/primitives';
import type { ProjectAttempt, ProjectState } from './state';

export function EvaluationStudio({
  definition,
  data,
  update,
}: {
  definition: LabDefinition;
  data: ProjectState;
  update: (change: (p: ProjectState) => ProjectState) => void;
}) {
  const auth = useSession();
  // Milestone evidence never invokes course progress actions or persistent run pointers.
  const controller = useLabRun(definition.id);
  const state = controller.state;
  const readiness = useAsync('project-models', (signal) => api.tutor.settings(signal));
  const [input, setInput] = useState(JSON.stringify(definition.exampleInput, null, 2));
  const [mode, setMode] = useState<'offline' | 'live'>('offline');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [observedMode, setObservedMode] = useState<'offline' | 'live'>('offline');
  const busy = state.phase === 'starting' || state.phase === 'streaming';
  async function run() {
    if (busy || !auth.session?.authenticated) return;
    if (mode === 'live' && !consent) {
      setError('Authorize this paid run first.');
      return;
    }
    try {
      const values = InputValuesSchema.parse(JSON.parse(input));
      setError('');
      setConsent(false);
      setObservedMode(mode);
      const result = await controller.run({ input: values, mode });
      if (result?.runId) {
        const attempt: ProjectAttempt = {
          id: result.runId,
          labId: definition.id,
          mode,
          status: result.terminal ?? 'interrupted',
          passed: result.terminal === 'succeeded' && result.validation?.passed === true,
          at: new Date().toISOString(),
          durationMs: result.durationMs ?? 0,
          checks: JSON.stringify(result.validation ?? { passed: false, checks: [] }).slice(0, 6000),
          output: (JSON.stringify(result.output ?? result.error ?? null, null, 2) ?? '').slice(0, 12000),
          review: {},
        };
        update((old) => ({ ...old, attempts: [attempt, ...old.attempts.filter((a) => a.id !== attempt.id)].slice(0, 40) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check the case input.');
    }
  }
  const answer = state.tokenText || completeAnswer(state.output);
  return (
    <div className="project-stack">
      <section className="project-panel" aria-label="Evaluation controls">
        <h2>Run an evaluation case</h2>
        <p>
          Actual registered lab runs. Offline uses deterministic fixtures. Edit one input at a time and compare evidence; a
          passing run does not establish mastery.
        </p>
        <p>
          <strong>Expected:</strong> {definition.expectedOutput.description}
        </p>
        <label>
          Case input JSON
          <textarea
            className="project-json"
            rows={10}
            maxLength={30000}
            value={input}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value);
              setConsent(false);
            }}
          />
        </label>
        <label>
          Evaluation mode
          <select
            disabled={busy}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as 'offline' | 'live');
              setConsent(false);
            }}
          >
            <option value="offline">Offline - deterministic run</option>
            <option
              value="live"
              disabled={
                readiness.status !== 'success' || !readiness.data.liveEnabled || !readiness.data.models.some((m) => m.configured)
              }
            >
              Live - provider charges
            </option>
          </select>
        </label>
        {mode === 'live' && (
          <>
            <p>
              {definition.execution.costNotice} Provider choice follows the case input; credentials remain on the server.
              Configuration is not verified billing access.
            </p>
            <label className="project-check">
              <input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
              Authorize this paid evaluation
            </label>
          </>
        )}
        <div className="project-actions">
          <Button disabled={busy || !auth.session?.authenticated || (mode === 'live' && !consent)} onClick={() => void run()}>
            Run evaluation
          </Button>
          <Button
            variant="secondary"
            disabled={!busy}
            onClick={() =>
              void controller
                .cancel()
                .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Cancellation failed.'))
            }
          >
            Cancel evaluation
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setInput(JSON.stringify(definition.exampleInput, null, 2))}>
            Reset case input
          </Button>
        </div>
        {!auth.session?.authenticated && (
          <p role="status">
            {auth.status === 'loading' ? 'Starting learner session...' : 'Start a learner session to execute cases.'}
          </p>
        )}
        <p role="status" data-testid="evaluation-status">
          {state.terminal ?? state.phase} - {observedMode === 'offline' ? 'Offline fixture' : 'Live provider run'} {state.runId}
        </p>
        {(error || state.error) && <p role="alert">{error || state.error?.code + ': ' + state.error?.message}</p>}
        <ApprovalPanel approvals={pendingApprovals(state)} onDecide={controller.decide} />
      </section>
      <section className="project-panel">
        <h2>Observed answer and objective checks</h2>
        {answer && <FormattedResponse text={answer} />}
        <JsonView value={state.output} label="Evaluation result" />
        {state.validation && (
          <ul>
            {state.validation.checks.map((check) => (
              <li key={check.id}>
                {check.passed ? 'Passed' : 'Failed'}: {check.label} {check.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="project-panel">
        <h2>Actual execution timeline</h2>
        <RunTimeline state={state} />
        <TraceView state={state} />
      </section>
      <section className="project-panel">
        <h2>Review history</h2>
        <p>
          {new Set(data.attempts.map((a) => a.labId)).size} distinct cases tried; latest {data.attempts.length} of at most 40
          attempts. Output summaries are bounded excerpts. Review checkboxes are self-assessment.
        </p>
        {data.attempts.map((attempt) => (
          <details key={attempt.id}>
            <summary>
              {attempt.labId} - {attempt.mode} - {attempt.status} -{' '}
              {attempt.passed ? 'objective checks passed' : 'not all checks passed'}
            </summary>
            <p>
              {attempt.at} - {attempt.durationMs} ms
            </p>
            <JsonView value={attempt.output} label="Saved evaluation excerpt" />
            {['Expected output explained', 'Trace and checks inspected', 'Limits and failure path reviewed'].map((label, i) => (
              <label className="project-check" key={label}>
                <input
                  type="checkbox"
                  checked={attempt.review[String(i)] ?? false}
                  onChange={(e) =>
                    update((old) => ({
                      ...old,
                      attempts: old.attempts.map((a) =>
                        a.id === attempt.id ? { ...a, review: { ...a.review, [String(i)]: e.target.checked } } : a,
                      ),
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </details>
        ))}
      </section>
    </div>
  );
}
