import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { TUTOR_QUESTION_LIMIT, type LabDefinition, type RuntimeMode, type TutorSettings } from '@mlp/contracts';
import { ApiClientError, api } from '../../api/client';
import { useSession } from '../../lib/auth-context';
import { Button } from '../ui/primitives';
import { FormattedResponse } from '../workspace/FormattedResponse';
import './ai-tutor.css';

type Status =
  'Ready' | 'Connecting' | 'Answering' | 'Complete' | 'Stopped receiving' | 'Failed' | 'Timed out' | 'Connection interrupted';

/** Fresh questions, temporary answers, and no connection to lesson completion or lab execution. */
export function AiTutor({ definition }: { definition: LabDefinition }) {
  const { session, invalidate } = useSession();
  const location = useLocation();
  const subject = session?.principal?.sub;
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const questionBox = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<TutorSettings | null>(null);
  const [setupError, setSetupError] = useState('');
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [mode, setMode] = useState<RuntimeMode>('offline');
  const [modelId, setModelId] = useState('');
  const [question, setQuestion] = useState('Explain this lesson with a small example.');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  const [status, setStatus] = useState<Status>('Ready');
  const [answerMode, setAnswerMode] = useState<RuntimeMode>('offline');
  const [answerModel, setAnswerModel] = useState('');
  const busy = status === 'Connecting' || status === 'Answering';
  const selectedModel =
    settings?.models.find((m) => m.id === modelId && m.configured)?.id || settings?.models.find((m) => m.configured)?.id || '';

  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    void api.tutor
      .settings(ctrl.signal)
      .then((value) => {
        if (!ctrl.signal.aborted) {
          setSettings(value);
          setSetupError('');
        }
      })
      .catch((error: unknown) => {
        if (!ctrl.signal.aborted) setSetupError(error instanceof Error ? error.message : 'Cannot load tutor configuration.');
      });
    return () => ctrl.abort();
  }, [open, setupAttempt]);

  const stop = () => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    if (busy) {
      setStatus('Stopped receiving');
      setMessage('Partial text is incomplete. The server was asked to abort; remote cancellation is not confirmed.');
    }
  };
  const close = () => {
    stop();
    dialog.current?.close();
    setOpen(false);
    launcher.current?.focus();
  };

  const ask = async () => {
    if (!subject || busy) return;
    if (!question.trim() || question.length > TUTOR_QUESTION_LIMIT) {
      setValidation('Write a question between 1 and 2,000 characters.');
      questionBox.current?.focus();
      return;
    }
    setValidation('');
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++generation.current;
    setStatus('Connecting');
    setText('');
    setMessage('');
    setAnswerMode(mode);
    setAnswerModel(mode === 'live' ? selectedModel : '');
    try {
      await api.tutor.answer(
        subject,
        { labId: definition.id, question, mode, ...(mode === 'live' ? { modelId: selectedModel } : {}) },
        (event) => {
          if (id !== generation.current || ctrl.signal.aborted) return;
          if (event.type === 'started') setStatus('Answering');
          else if (event.type === 'text') setText(event.text);
          else if (event.type === 'complete') {
            setText(event.text);
            setStatus('Complete');
          } else {
            setStatus(event.code === 'TIMEOUT' ? 'Timed out' : 'Failed');
            setMessage(`${event.code}: ${event.message}`);
          }
        },
        ctrl.signal,
      );
    } catch (error) {
      if (id !== generation.current || ctrl.signal.aborted) return;
      setStatus(error instanceof ApiClientError && error.code === 'NETWORK' ? 'Connection interrupted' : 'Failed');
      setMessage(error instanceof Error ? error.message : 'Tutor could not finish. Retry explicitly.');
      if (error instanceof ApiClientError && error.code === 'UNAUTHORIZED') invalidate();
    } finally {
      if (id === generation.current) controller.current = null;
    }
  };
  const examples = [
    { label: 'Explain the concept', question: `Explain ${definition.title} in simple terms with a small TypeScript example.` },
    { label: 'Give me a hint', question: 'I am stuck. Give me the first hint and one small next step.' },
    { label: 'Debug my approach', question: 'What common mistakes cause errors in this lesson, and how should I debug them?' },
  ];

  return (
    <div className="ai-tutor-entry">
      <Button
        ref={launcher}
        variant="secondary"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        AI Tutor
      </Button>
      <dialog
        ref={dialog}
        className="ai-tutor-panel"
        aria-labelledby="ai-tutor-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Your study companion</p>
              <h2 id="ai-tutor-title" className="mt-1 text-xl font-bold">
                AI Tutor
              </h2>
              <p className="mt-2 text-sm text-fg-muted">
                {definition.id} · {definition.title}
              </p>
            </div>
            <Button variant="secondary" onClick={close}>
              Close AI Tutor
            </Button>
          </div>
          <p className="text-sm text-fg-muted">
            Ask about this lesson, get a hint or work through an error. Each question starts fresh. Answers are temporary and do
            not complete lessons or change quiz results.
          </p>
          {!subject ? (
            <p role="status">
              <Link
                className="text-accent underline"
                to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                onClick={close}
              >
                Sign in to use AI Tutor
              </Link>
            </p>
          ) : null}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
            className="flex min-w-0 flex-col gap-4"
          >
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                Tutor mode
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(event) => setMode(event.target.value as RuntimeMode)}
                  className="rounded-lg border border-border-strong bg-surface p-2 text-fg"
                >
                  <option value="offline">Offline · free study guide</option>
                  <option value="live" disabled={!settings?.liveEnabled}>
                    Live · uses provider API tokens
                  </option>
                </select>
              </label>
              {mode === 'live' ? (
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                  Tutor model
                  <select
                    value={selectedModel}
                    disabled={busy}
                    onChange={(event) => setModelId(event.target.value)}
                    className="min-w-0 max-w-full rounded-lg border border-border-strong bg-surface p-2 text-fg"
                  >
                    {settings?.models
                      .filter((m) => m.configured)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </div>
            {setupError ? (
              <div role="alert" className="text-sm text-danger">
                {setupError}{' '}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSetupError('');
                    setSetupAttempt((value) => value + 1);
                  }}
                >
                  Retry configuration
                </Button>
              </div>
            ) : null}
            {settings && !settings.liveEnabled ? (
              <details className="rounded-lg border border-border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Enable live tutor</summary>
                <p className="mt-2">
                  Set MASTRA_MODE=live and your provider API key in the repository-root .env, enable its model in LIVE_MODELS if
                  needed, then restart the API. Keep keys on the server. Configuration does not verify provider access or credit.
                </p>
              </details>
            ) : null}
            {mode === 'live' ? (
              <p className="rounded-lg border border-warning p-3 text-sm text-warning" id="tutor-usage">
                Live sends your question and lesson teaching context to{' '}
                {settings?.models.find((m) => m.id === selectedModel)?.provider ?? 'the selected provider'} and may incur charges.
                Model access and billing are not verified. Do not include credentials or private data.
              </p>
            ) : (
              <p id="tutor-usage" className="text-sm text-fg-muted">
                Free, deterministic lesson guidance; no AI provider is called. Live mode can answer custom questions using your
                configured provider.
              </p>
            )}
            <label htmlFor="tutor-question" className="text-sm font-semibold">
              Your question
            </label>
            <textarea
              ref={questionBox}
              id="tutor-question"
              rows={4}
              maxLength={TUTOR_QUESTION_LIMIT}
              value={question}
              disabled={busy || !subject}
              aria-invalid={Boolean(validation)}
              aria-describedby={`tutor-usage${validation ? ' tutor-validation' : ''}`}
              onChange={(event) => {
                setQuestion(event.target.value);
                setValidation('');
              }}
              className="w-full resize-y rounded-lg border border-border-strong bg-surface p-3 text-sm text-fg"
            />
            {validation ? (
              <p id="tutor-validation" role="alert" className="text-sm text-danger">
                {validation}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Example tutor questions">
              {examples.map((example) => (
                <Button
                  key={example.label}
                  type="button"
                  variant="secondary"
                  disabled={busy || !subject}
                  onClick={() => {
                    setQuestion(example.question);
                    setValidation('');
                    questionBox.current?.focus();
                  }}
                >
                  {example.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || !subject || (mode === 'live' && (!settings?.liveEnabled || !selectedModel))}
              >
                {mode === 'live' ? 'Ask live tutor' : 'Ask tutor'}
              </Button>
              <Button type="button" variant="secondary" disabled={!busy} onClick={stop}>
                Stop receiving
              </Button>
              {['Failed', 'Timed out', 'Connection interrupted', 'Stopped receiving'].includes(status) ? (
                <Button type="button" variant="secondary" disabled={!subject} onClick={() => void ask()}>
                  Retry question
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  stop();
                  setText('');
                  setStatus('Ready');
                  setMessage('');
                  setValidation('');
                }}
              >
                Clear answer
              </Button>
            </div>
          </form>
          <section aria-labelledby="tutor-answer-title" className="min-w-0 border-t border-border pt-4">
            <h3 id="tutor-answer-title" className="font-semibold">
              Tutor answer
            </h3>
            <p role="status" className="my-2 text-sm font-medium" data-testid="tutor-status">
              {status}
              {text || busy ? ` · ${answerMode === 'offline' ? 'Offline · simulated guidance' : `Live · ${answerModel}`}` : ''}
            </p>
            <div data-testid="tutor-answer" className="min-w-0 text-sm">
              {text ? <FormattedResponse text={text} /> : <p className="text-fg-muted">Your answer will appear here.</p>}
            </div>
            {message ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {message}
              </p>
            ) : null}
          </section>
          <p className="text-xs text-fg-muted">
            AI answers may contain mistakes. Check the lesson reference source. Stop receiving, closing or leaving asks the server
            to abort; remote cancellation and charges are not confirmed.
          </p>
        </div>
      </dialog>
    </div>
  );
}
