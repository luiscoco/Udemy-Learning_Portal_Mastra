import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatTranscriptSchema, type ChatTranscript, type LabDefinition, type RuntimeMode } from '@mlp/contracts';
import { useLabRun } from '../../features/run/useLabRun';
import type { RunState } from '../../features/run/run-state';
import { cn } from '../../lib/cn';
import { useProgressActions } from '../../lib/progress-actions';
import { useSession } from '../../lib/auth-context';
import { Button } from '../ui/primitives';

export function chatTranscriptOf(output: unknown): ChatTranscript | null {
  if (!output || typeof output !== 'object' || !('chat' in output)) return null;
  const parsed = ChatTranscriptSchema.safeParse((output as { chat: unknown }).chat);
  return parsed.success ? parsed.data : null;
}

const FAULTS = [
  { value: 'none', label: 'No fault' },
  { value: 'slow', label: 'Slow tokens' },
  { value: 'fail', label: 'Provider fails' },
] as const;

/**
 * The Run tab of a chat lab (L67): one run per message on a thread. Tokens stream into a live bubble
 * from the run reducer (which ignores replayed sequence numbers); Stop shows “Stopping…” immediately and
 * cancels with the run token; Retry replaces a stopped or failed last turn.
 */
export function ChatPanel({ definition }: { definition: LabDefinition }) {
  const auth = useSession();
  const { state, run, cancel } = useLabRun(definition.id);
  const { update } = useProgressActions(definition.id);
  const modelField = definition.inputs.find((f) => f.name === 'modelId');
  const models = modelField?.kind === 'select' ? modelField.options.map((o) => o.value) : [];
  const [modelId, setModelId] = useState<string>(
    String((definition.exampleInput as { modelId?: string }).modelId ?? models[0] ?? ''),
  );
  const [mode, setMode] = useState<RuntimeMode>(definition.execution.modes[0] ?? 'offline');
  const [fault, setFault] = useState<string>('none');
  const [threadId, setThreadId] = useState('chat-1');
  const [chat, setChat] = useState<ChatTranscript | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = state.phase === 'starting' || state.phase === 'streaming';
  const listRef = useRef<HTMLOListElement>(null);

  const exec = useCallback(
    (input: Record<string, unknown>): Promise<RunState | undefined> =>
      run({ input: { modelId, fault: 'none', retry: false, message: '', ...input }, mode }),
    [run, modelId, mode],
  );

  const load = useCallback(
    async (id: string) => {
      const final = await exec({ action: 'history', threadId: id });
      const transcript = chatTranscriptOf(final?.output);
      if (transcript) setChat(transcript);
      if (final?.error?.code === 'UNAUTHORIZED') auth.invalidate();
    },
    [exec, auth],
  );

  useEffect(() => {
    // Load the history once per thread, outside the effect body (StrictMode's second mount clears the first).
    // `load` changes with the model and mode, which must not reload the history.
    const timer = setTimeout(() => void load(threadId), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }, [chat, state.tokenText]);

  const send = async (text: string, retry = false) => {
    if (!text.trim() || busy) return;
    setNotice(null);
    setStopping(false);
    setPending(text);
    setDraft('');
    const final = await exec({ action: 'send', threadId, message: text, retry, fault });
    setPending(null);
    if (final?.terminal === 'cancelled') {
      // Keep showing “Stopping…” until the stopped turn is on screen.
      await load(threadId);
      setStopping(false);
      setNotice('Stopped. The partial reply is kept and marked as stopped.');
      return;
    }
    setStopping(false);
    const transcript = chatTranscriptOf(final?.output);
    if (transcript) {
      setChat(transcript);
      if (transcript.turn?.status === 'failed') setNotice('The model failed before replying. Press Retry to send it again.');
    } else if (final?.error) setNotice(`${final.error.code}: ${final.error.message}`);
    if (final?.terminal === 'succeeded')
      update((cur) => ({ runSucceeded: true, checksPassed: cur.checksPassed || final.validation?.passed === true }));
  };

  const stop = async () => {
    setStopping(true); // immediate feedback; the cancel request and the stream end follow
    await cancel();
  };

  const messages = chat?.threadId === threadId ? chat.messages : [];
  const last = messages.at(-1);
  const retryText =
    !busy && last
      ? last.role === 'user' && last.status === 'failed'
        ? last.text
        : last.role === 'assistant' && last.status !== 'complete'
          ? messages.at(-2)?.text
          : undefined
      : undefined;
  const threads = [
    ...new Map([...(chat?.threads ?? []).map((t) => [t.id, t.title] as const), [threadId, threadId] as const]).entries(),
  ];
  const streaming = busy && pending !== null;

  return (
    <div className="flex flex-col gap-4" data-testid="chat-panel">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Thread</span>
          <select
            name="chatThread"
            className="rounded-lg border border-border-strong bg-surface px-2 py-1.5"
            value={threadId}
            disabled={busy}
            onChange={(e) => setThreadId(e.target.value)}
          >
            {threads.map(([id, title]) => (
              <option key={id} value={id}>
                {id === title ? id : `${id} — ${title.slice(0, 40)}`}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            // Time-based, so two tabs creating a thread at once never pick the same id.
            const used = new Set(threads.map(([id]) => id));
            let id = `chat-${Date.now().toString(36)}`;
            while (used.has(id)) id = `chat-${(Date.now() + Math.floor(Math.random() * 1e6)).toString(36)}`;
            setThreadId(id);
          }}
        >
          New thread
        </Button>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Fault</span>
          <select
            name="chatFault"
            className="rounded-lg border border-border-strong bg-surface px-2 py-1.5"
            value={fault}
            disabled={busy}
            onChange={(e) => setFault(e.target.value)}
          >
            {FAULTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Mode</span>
          <select
            name="chatMode"
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
              name="chatModel"
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
      </div>

      {/* The log role sits on a wrapper: on the <ol> itself it would strip the list semantics of its items. */}
      <div
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        tabIndex={0}
        className="max-h-[28rem] min-h-40 overflow-y-auto rounded-lg border border-border p-3"
      >
        <ol ref={listRef} className="flex flex-col gap-3">
          {messages.length === 0 && !pending ? <li className="text-sm text-fg-muted">No messages yet. Say hello.</li> : null}
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} status={m.status} text={m.text} />
          ))}
          {pending !== null ? <Bubble role="user" status="complete" text={pending} /> : null}
          {streaming ? (
            <li data-testid="chat-streaming" className="max-w-[85%] self-start rounded-lg bg-surface-muted px-3 py-2 text-sm">
              <span className="sr-only">Assistant (streaming): </span>
              {state.tokenText}
              <span aria-hidden="true" className="ml-0.5 animate-pulse">
                ▍
              </span>
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
        <label htmlFor={`${definition.id}-chat-input`} className="text-sm font-medium">
          Message
        </label>
        <textarea
          id={`${definition.id}-chat-input`}
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
          placeholder="Type a message. Enter sends, Shift+Enter adds a line."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !draft.trim()}>
            Send
          </Button>
          <Button variant="danger" disabled={!streaming || stopping || !state.runId} onClick={() => void stop()}>
            Stop
          </Button>
          {retryText ? (
            <Button variant="secondary" onClick={() => void send(retryText, true)}>
              Retry
            </Button>
          ) : null}
          <p role="status" aria-live="polite" className="text-sm font-medium" data-testid="chat-status">
            {stopping ? 'Stopping…' : streaming ? 'Streaming…' : busy ? 'Loading…' : (notice ?? '')}
          </p>
        </div>
      </form>
      <p className="text-xs text-fg-subtle">{definition.execution.costNotice}</p>
    </div>
  );
}

function Bubble({ role, status, text }: { role: 'user' | 'assistant'; status: string; text: string }) {
  return (
    <li
      data-testid="chat-message"
      data-role={role}
      data-status={status}
      className={cn(
        'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
        role === 'user' ? 'self-end bg-accent text-accent-fg' : 'self-start bg-surface-muted',
        status !== 'complete' && 'border border-dashed border-warning',
      )}
    >
      <span className="sr-only">{role === 'user' ? 'You' : 'Assistant'}: </span>
      {text || (status === 'stopped' ? '…' : '')}
      {status !== 'complete' ? (
        <span className="mt-1 block text-xs font-medium text-warning">
          {status === 'stopped' ? 'Stopped' : 'Failed — no reply'}
        </span>
      ) : null}
    </li>
  );
}
