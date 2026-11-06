import { FormattedResponse } from './FormattedResponse';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceTurnSchema, type LabDefinition, type RuntimeMode, type WorkspaceTurn } from '@mlp/contracts';
import { useLabRun } from '../../features/run/useLabRun';
import type { RunState, StepView } from '../../features/run/run-state';
import { cn } from '../../lib/cn';
import { useProgressActions } from '../../lib/progress-actions';
import { useSession } from '../../lib/auth-context';
import { Badge, Button } from '../ui/primitives';
import { CitedAnswer } from './CitedAnswer';
import { JsonView, RunTimeline } from './RunTimeline';
import { Tabs } from './Tabs';

export function workspaceTurnOf(output: unknown): WorkspaceTurn | null {
  if (!output || typeof output !== 'object' || !('workspace' in output)) return null;
  const parsed = WorkspaceTurnSchema.safeParse((output as { workspace: unknown }).workspace);
  return parsed.success ? parsed.data : null;
}

type Pane = 'knowledge' | 'chat' | 'inspector';
type InspectorTab = 'tasks' | 'citations' | 'tools' | 'trace';
const PANES: { id: Pane; label: string }[] = [
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'chat', label: 'Chat' },
  { id: 'inspector', label: 'Inspector' },
];

interface TaskView {
  n: number;
  title: string;
  status: string;
}

/** Live tasks from the run's "task:<n>" steps; after the run, the output's final list. */
export function tasksOf(steps: StepView[], final?: WorkspaceTurn['tasks']): TaskView[] {
  const live = steps
    .filter((s) => s.stepId.startsWith('task:'))
    .map((s) => ({
      n: Number(s.stepId.slice(5)),
      title: String((s.input as { title?: unknown } | undefined)?.title ?? s.stepId),
      status: s.status === 'success' ? 'done' : s.status,
    }))
    .sort((a, b) => a.n - b.n);
  return live.length > 0 ? live : (final ?? []);
}

/**
 * The Run tab of a workspace lab (L70): knowledge documents, the chat on a memory thread, and an inspector
 * (tasks, citations, tools, trace) for the latest run. Three columns at `lg`; below it, one pane at a time
 * with a pane switcher, so nothing scrolls sideways.
 */
export function AgentWorkspace({ definition }: { definition: LabDefinition }) {
  const auth = useSession();
  const { state, run, cancel } = useLabRun(definition.id);
  const { update } = useProgressActions(definition.id);
  const modelField = definition.inputs.find((f) => f.name === 'modelId');
  const models = modelField?.kind === 'select' ? modelField.options.map((o) => o.value) : [];
  const [modelId, setModelId] = useState<string>(
    String((definition.exampleInput as { modelId?: string }).modelId ?? models[0] ?? ''),
  );
  const [mode, setMode] = useState<RuntimeMode>(definition.execution.modes[0] ?? 'offline');
  const threadId = String((definition.exampleInput as { threadId?: string }).threadId ?? 'workspace-1');
  const [ws, setWs] = useState<WorkspaceTurn | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>('chat');
  const [tab, setTab] = useState<InspectorTab>('tasks');
  const [doc, setDoc] = useState<WorkspaceTurn['documents'][number] | null>(null);
  const docDialog = useRef<HTMLDialogElement>(null);
  const docTrigger = useRef<HTMLButtonElement | null>(null);
  const busy = state.phase === 'starting' || state.phase === 'streaming';
  const idPrefix = `${definition.id}-ws`;

  const exec = useCallback(
    (input: Record<string, unknown>): Promise<RunState | undefined> =>
      run({ input: { modelId, threadId, message: '', ...input }, mode }),
    [run, modelId, threadId, mode],
  );

  const apply = useCallback(
    (final: RunState | undefined) => {
      const turn = workspaceTurnOf(final?.output);
      if (turn) setWs(turn);
      if (final?.error?.code === 'UNAUTHORIZED') auth.invalidate();
      return turn;
    },
    [auth],
  );

  useEffect(() => {
    // Load documents and history once, outside the effect body (StrictMode's second mount clears the first).
    const timer = setTimeout(() => void exec({ action: 'history' }).then(apply), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seed = async () => {
    setNotice(null);
    const turn = apply(await exec({ action: 'seed' }));
    if (turn?.seeded) setNotice(`Seeded: ${turn.seeded.added} added, ${turn.seeded.existing} already there.`);
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setNotice(null);
    setStopping(false);
    setPending(text);
    setDraft('');
    const final = await exec({ action: 'send', message: text });
    setPending(null);
    setStopping(false);
    if (final?.terminal === 'cancelled') {
      apply(await exec({ action: 'history' }));
      setNotice('Stopped.');
      return;
    }
    const turn = apply(final);
    if (!turn && final?.error) setNotice(`${final.error.code}: ${final.error.message}`);
    if (turn?.citedAnswer?.blocked.length) setNotice(`${turn.citedAnswer.blocked.length} claim(s) blocked: see Citations.`);
    if (final?.terminal === 'succeeded')
      update((cur) => ({ runSucceeded: true, checksPassed: cur.checksPassed || final.validation?.passed === true }));
  };

  const openDoc = (d: WorkspaceTurn['documents'][number], trigger: HTMLButtonElement) => {
    docTrigger.current = trigger;
    setDoc(d);
    queueMicrotask(() => docDialog.current?.showModal());
  };

  const documents = ws?.documents ?? [];
  const messages = ws?.messages ?? [];
  const sending = busy && pending !== null;
  const tasks = tasksOf(state.steps, ws?.tasks);
  const searchCalls = state.tools;
  const paneClass = (p: Pane) =>
    cn('min-w-0 flex-col gap-3 rounded-lg border border-border p-3 lg:flex', pane === p ? 'flex' : 'hidden');

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="agent-workspace">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Mode</span>
          <select
            name="wsMode"
            className="rounded-lg border border-border-strong bg-surface px-2 py-1.5"
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as RuntimeMode)}
          >
            {definition.execution.modes.map((m) => (
              <option key={m} value={m}>
                {m === 'offline' ? 'Offline (free)' : 'Live (may cost money)'}
              </option>
            ))}
          </select>
        </label>
        {mode === 'live' && models.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Model</span>
            <select
              name="wsModel"
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5"
              value={modelId}
              disabled={busy}
              onChange={(e) => setModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="text-sm text-fg-muted">
          Thread <span className="font-mono">{threadId}</span>
        </p>
      </div>

      <div role="group" aria-label="Show pane" className="flex gap-1 lg:hidden">
        {PANES.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={pane === p.id ? 'primary' : 'secondary'}
            aria-pressed={pane === p.id}
            onClick={() => setPane(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.5fr)]">
        <section aria-labelledby={`${idPrefix}-knowledge`} className={paneClass('knowledge')} data-testid="pane-knowledge">
          <h3 id={`${idPrefix}-knowledge`} className="text-sm font-semibold">
            Knowledge
          </h3>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void seed()}>
            Seed sample documents
          </Button>
          {documents.length === 0 ? (
            <p className="text-sm text-fg-muted">No documents yet. Seed the samples to start.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Documents">
              {documents.map((d) => (
                <li key={d.docId} className="min-w-0">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-surface-muted [overflow-wrap:anywhere]"
                    onClick={(e) => openDoc(d, e.currentTarget)}
                  >
                    <span className="font-medium">{d.name}</span>{' '}
                    <span className="text-xs text-fg-muted">
                      {d.chars} chars{d.sample ? ' · sample' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${idPrefix}-chat`} className={paneClass('chat')} data-testid="pane-chat">
          <h3 id={`${idPrefix}-chat`} className="text-sm font-semibold">
            Chat
          </h3>
          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            tabIndex={0}
            className="max-h-[28rem] min-h-40 overflow-y-auto"
          >
            <ol className="flex flex-col gap-3">
              {messages.length === 0 && !pending ? (
                <li className="text-sm text-fg-muted">Ask a question about your documents.</li>
              ) : null}
              {messages.map((m) => (
                <Bubble key={m.id} role={m.role} text={m.text} />
              ))}
              {pending !== null ? <Bubble role="user" text={pending} /> : null}
              {sending ? (
                <li className="self-start text-sm text-fg-muted" data-testid="ws-working">
                  Working: {tasks.find((t) => t.status === 'running')?.title ?? 'planning'}…
                </li>
              ) : null}
            </ol>
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label htmlFor={`${idPrefix}-input`} className="text-sm font-medium">
              Question
            </label>
            <textarea
              id={`${idPrefix}-input`}
              rows={2}
              maxLength={1000}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              className="w-full rounded-lg border border-border-strong bg-surface p-2 text-sm"
              placeholder="Ask about your documents. Enter sends."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy || !draft.trim()}>
                Send
              </Button>
              <Button
                variant="danger"
                disabled={!sending || stopping || !state.runId}
                onClick={() => {
                  setStopping(true);
                  void cancel();
                }}
              >
                Stop
              </Button>
              <p role="status" aria-live="polite" className="text-sm font-medium" data-testid="ws-status">
                {stopping ? 'Stopping…' : sending ? 'Working…' : busy ? 'Loading…' : (notice ?? '')}
              </p>
            </div>
          </form>
        </section>

        <section aria-labelledby={`${idPrefix}-inspector`} className={paneClass('inspector')} data-testid="pane-inspector">
          <h3 id={`${idPrefix}-inspector`} className="text-sm font-semibold">
            Inspector
          </h3>
          <Tabs<InspectorTab>
            label="Inspector"
            idPrefix={`${idPrefix}-insp`}
            selected={tab}
            onSelect={setTab}
            tabs={[
              {
                id: 'tasks',
                label: 'Tasks',
                panel:
                  tasks.length === 0 ? (
                    <p className="text-sm text-fg-muted">No tasks yet. Ask a question to see the plan.</p>
                  ) : (
                    <ol className="flex flex-col gap-1 text-sm" aria-label="Tasks" data-testid="ws-tasks">
                      {tasks.map((t) => (
                        <li
                          key={t.n}
                          data-status={t.status}
                          className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border px-2 py-1"
                        >
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {t.n}. {t.title}
                          </span>
                          <Badge tone={t.status === 'done' ? 'success' : t.status === 'running' ? 'warning' : 'neutral'}>
                            {t.status}
                          </Badge>
                        </li>
                      ))}
                    </ol>
                  ),
              },
              {
                id: 'citations',
                label: 'Citations',
                panel: ws?.citedAnswer ? (
                  <CitedAnswer data={ws.citedAnswer} idPrefix={`${idPrefix}-cite`} />
                ) : (
                  <p className="text-sm text-fg-muted">The verified citations of the latest answer appear here.</p>
                ),
              },
              {
                id: 'tools',
                label: 'Tools',
                panel:
                  searchCalls.length === 0 ? (
                    <p className="text-sm text-fg-muted">No tool calls in the latest run.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 text-sm" aria-label="Tool calls">
                      {searchCalls.map((t) => (
                        <li key={t.toolCallId} className="min-w-0 rounded-md border border-border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-medium">{t.toolName}</span>
                            <Badge tone={t.status === 'success' ? 'success' : t.status === 'running' ? 'warning' : 'danger'}>
                              {t.status}
                            </Badge>
                          </div>
                          <JsonView value={t.args} label={`${t.toolName} arguments`} />
                          <JsonView value={t.error ?? t.result} label={`${t.toolName} result`} />
                        </li>
                      ))}
                    </ul>
                  ),
              },
              { id: 'trace', label: 'Trace', panel: <RunTimeline state={state} /> },
            ]}
          />
        </section>
      </div>
      <p className="text-xs text-fg-subtle">{definition.execution.costNotice}</p>

      <dialog
        ref={docDialog}
        aria-labelledby={`${idPrefix}-doc-title`}
        onClose={() => {
          docTrigger.current?.focus();
          setDoc(null);
        }}
        className="w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-fg backdrop:bg-black/50"
      >
        {doc ? (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 id={`${idPrefix}-doc-title`} className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                {doc.name}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => docDialog.current?.close()}>
                Close
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]" data-testid="doc-preview">
              {doc.preview}
            </p>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  return (
    <li
      data-testid="ws-message"
      data-role={role}
      className={cn(
        'min-w-0 max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm [overflow-wrap:anywhere]',
        role === 'user' ? 'self-end bg-accent text-accent-fg' : 'self-start bg-surface-muted',
      )}
    >
      <span className="sr-only">{role === 'user' ? 'You' : 'Assistant'}: </span>
      {role === 'assistant' ? <FormattedResponse text={text} /> : text}
    </li>
  );
}
