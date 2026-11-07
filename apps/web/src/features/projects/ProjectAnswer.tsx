import { useEffect, useRef, useState } from 'react';
import type { LabDefinition, TutorSettings } from '@mlp/contracts';
import { api, ApiClientError } from '../../api/client';
import { useSession } from '../../lib/auth-context';
import { FormattedResponse } from '../../components/workspace/FormattedResponse';
import { Button } from '../../components/ui/primitives';
import type { PublishedAnswer } from './state';

export function ProjectAnswer({
  definition,
  topic,
  initialQuestion,
  shortcuts = [],
  onComplete,
}: {
  definition: LabDefinition;
  topic: string;
  initialQuestion: string;
  shortcuts?: string[];
  onComplete?: (answer: PublishedAnswer) => void;
}) {
  const auth = useSession();
  const [question, setQuestion] = useState(initialQuestion);
  const [mode, setMode] = useState<'offline' | 'live'>('offline');
  const [settings, setSettings] = useState<TutorSettings | null>(null);
  const [model, setModel] = useState('');
  const [consent, setConsent] = useState(false);
  const [answerMode, setAnswerMode] = useState<'offline' | 'live'>('offline');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    void api.tutor
      .settings(ctrl.signal)
      .then((value) => {
        if (!ctrl.signal.aborted) {
          setSettings(value);
          setModel(value.models.find((m) => m.configured)?.id ?? '');
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setError('Model readiness is unavailable. Offline guidance remains available.');
      });
    return () => {
      ctrl.abort();
      pending.current?.abort();
    };
  }, []);
  const stop = () => {
    pending.current?.abort();
    setBusy(false);
    setStatus('Stopped - incomplete');
    setConsent(false);
  };
  async function ask() {
    if (busy || !auth.session?.authenticated || !auth.session.principal) return;
    if (!question.trim() || question.trim().length > 2000) {
      setError('Enter 1-2000 characters.');
      return;
    }
    if (mode === 'live' && (!consent || !model || !settings?.liveEnabled)) {
      setError('Choose a configured model and authorize this paid question.');
      return;
    }
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    const submitted = { question: question.trim(), mode, modelId: mode === 'live' ? model : undefined };
    setAnswerMode(mode);
    setBusy(true);
    setError('');
    setText('');
    setStatus('Answering');
    setConsent(false);
    try {
      await api.tutor.answer(
        auth.session.principal.sub,
        { labId: definition.id, ...submitted },
        (event) => {
          if (ctrl.signal.aborted || pending.current !== ctrl) return;
          if (event.type === 'text') setText((previous) => previous + event.text);
          if (event.type === 'error') {
            setStatus('Failed - incomplete');
            setError(event.message);
          }
          if (event.type === 'complete') {
            const fence = String.fromCharCode(96).repeat(3);
            const example = [
              "import { Agent } from '@mastra/core/agent';",
              'const agent = new Agent({',
              "  id: 'coach', name: 'Study Coach',",
              "  instructions: 'Explain one Mastra concept clearly.',",
              "  model: 'openai/gpt-4o-mini',",
              '});',
              "const result = await agent.generate('Explain agents', {",
              '  maxSteps: 1, abortSignal: AbortSignal.timeout(30000),',
              '});',
              'console.log(result.text);',
            ].join('\n');
            const completedText =
              submitted.mode === 'offline' && event.text.length < 14500
                ? event.text +
                  '\n\n### Related minimal agent pattern\n\nAuthored project teaching excerpt; server-side setup omitted. This code is displayed, never executed here.\n\n' +
                  fence +
                  'typescript\n' +
                  example +
                  '\n' +
                  fence
                : event.text;
            setText(completedText);
            setStatus('Complete');
            onComplete?.({
              id: crypto.randomUUID(),
              labId: definition.id,
              topic,
              question: submitted.question,
              text: completedText,
              mode: submitted.mode,
              modelId: submitted.modelId ?? null,
              at: new Date().toISOString(),
            });
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted && pending.current === ctrl) {
        setStatus('Failed - incomplete');
        setError(err instanceof Error ? err.message : 'Answer failed. Retry explicitly.');
        if (err instanceof ApiClientError && err.code === 'UNAUTHORIZED') auth.invalidate();
      }
    } finally {
      if (pending.current === ctrl && !ctrl.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="project-panel" aria-label="Project coach">
      <h2>Ask the coach</h2>
      <p>
        Offline is fixed authored lesson guidance, not a tailored AI response. Live uses the selected lesson as server-owned
        context.
      </p>
      {!auth.session?.authenticated && (
        <p role="status">
          {auth.status === 'loading' ? 'Starting learner session...' : 'A learner session is required.'}{' '}
          <Button onClick={() => void auth.refresh()}>Retry learner session</Button>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label>
          Answer mode
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => {
              setMode(e.target.value as 'offline' | 'live');
              setConsent(false);
            }}
          >
            <option value="offline">Offline - free authored guide</option>
            <option value="live" disabled={!settings?.liveEnabled || !settings.models.some((m) => m.configured)}>
              Live - provider charges
            </option>
          </select>
        </label>
        {mode === 'live' && (
          <>
            <label>
              Answer model
              <select
                value={model}
                disabled={busy}
                onChange={(e) => {
                  setModel(e.target.value);
                  setConsent(false);
                }}
              >
                {settings?.models
                  .filter((m) => m.configured)
                  .map((m) => (
                    <option key={m.id}>{m.id}</option>
                  ))}
              </select>
            </label>
            <p>
              One bounded server request. Provider charges may apply; configuration does not verify access or billing. No
              automatic retry. Do not enter credentials.
            </p>
            <label className="project-check">
              <input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
              Authorize this paid answer
            </label>
          </>
        )}
        <div className="project-actions" aria-label="Question shortcuts">
          {shortcuts.map((prompt, i) => (
            <Button
              key={prompt}
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setQuestion(prompt);
                setConsent(false);
              }}
            >
              {i + 1}.{' '}
              {[
                'Step by step',
                'Source evidence',
                'Small code example',
                'Plain language',
                'Complete app',
                'Compare approaches',
                'Failure analysis',
                'Offline testing',
                'Evidence review',
                'Practice task',
              ][i] ?? 'Question'}
            </Button>
          ))}
        </div>
        <label>
          Your project question
          <textarea
            value={question}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => {
              setQuestion(e.target.value);
              setConsent(false);
            }}
            rows={4}
          />
        </label>
        <div className="project-actions">
          <Button type="submit" disabled={busy || !auth.session?.authenticated || (mode === 'live' && !consent)}>
            Ask project coach
          </Button>
          <Button type="button" variant="secondary" disabled={!busy} onClick={stop}>
            Stop answer
          </Button>
        </div>
      </form>
      <p role="status" data-testid="project-answer-status">
        {status} - {answerMode === 'offline' ? 'Offline authored guidance' : 'Live provider request'}
      </p>
      {error && <p role="alert">{error}</p>}
      {text && (
        <div data-testid="project-answer">
          <FormattedResponse text={text} />
        </div>
      )}
    </section>
  );
}
