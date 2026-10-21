import { useState } from 'react';
import type { LabDefinition, SourceFile } from '@mlp/contracts';
import { fetchSource } from '../../api/runs';
import { cn } from '../../lib/cn';
import { copyText, downloadText } from '../../lib/download';
import { useAsync } from '../../lib/use-async';
import { useStorageScope } from '../../lib/progress-scope';
import { claimGuest, GUEST_SCOPE, scratchKey } from '../../lib/storage-scope';
import { Badge, Button, Skeleton } from '../ui/primitives';
import { CodeBlock } from './CodeBlock';
import { Section } from './Section';

function FileActions({ file }: { file: SourceFile }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          setCopied((await copyText(file.code)) ? 'ok' : 'fail');
          setTimeout(() => setCopied('idle'), 2000);
        }}
      >
        Copy
      </Button>
      <Button variant="secondary" size="sm" onClick={() => downloadText(file.path.split('/').pop() ?? file.path, file.code)}>
        Download
      </Button>
      <span role="status" className="text-xs text-fg-muted">
        {copied === 'ok' ? 'Copied to clipboard' : copied === 'fail' ? 'Copy blocked — select and copy manually' : ''}
      </span>
    </div>
  );
}

/** Remounts per learner scope, so a second learner on this browser never sees the first one's notes. */
function Scratchpad({ labId }: { labId: string }) {
  const scope = useStorageScope();
  return <ScopedScratchpad key={scope} labId={labId} scope={scope} />;
}

function ScopedScratchpad({ labId, scope }: { labId: string; scope: string }) {
  const key = scratchKey(scope, labId);
  const [text, setText] = useState(() => {
    try {
      claimGuest(localStorage, scratchKey(GUEST_SCOPE, labId), key);
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  const id = `${labId}-scratch`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Your scratchpad
      </label>
      <textarea
        id={id}
        rows={10}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            localStorage.setItem(key, e.target.value);
          } catch {
            // ignore
          }
        }}
        className="w-full rounded-lg border border-border-strong bg-surface p-3 font-mono text-xs"
        placeholder="Draft your changes here, then apply them in your own project. This text is saved in your browser and never executed."
      />
      <p className="text-xs text-fg-subtle">Saved locally. The platform never executes code you write here.</p>
    </div>
  );
}

export function SourceTab({ definition }: { definition: LabDefinition }) {
  const state = useAsync(`source:${definition.id}`, (signal) => fetchSource(definition.id, signal));
  const [active, setActive] = useState(0);
  const [revealConfirm, setRevealConfirm] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const solutionPath = definition.exercise.solutionFile;

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading source…</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-danger">
        <p className="font-semibold">Could not load the source</p>
        <p className="mt-1 text-sm">{state.error.message}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={state.retry}>
          Retry
        </Button>
      </div>
    );
  }

  const files = state.data.files.filter((f) => f.path !== solutionPath);
  const solution = state.data.files.find((f) => f.path === solutionPath);
  const file = files[Math.min(active, files.length - 1)];

  return (
    <div className="flex flex-col gap-10">
      <Section title="Reference source" id={`${definition.id}-source-files`}>
        <div className="flex flex-wrap gap-2" aria-label="Pinned versions">
          {Object.entries(state.data.pinned).map(([k, v]) => (
            <Badge key={k} tone="accent">
              {k} {v}
            </Badge>
          ))}
        </div>
        {files.length === 0 || !file ? (
          <p className="text-sm text-fg-muted">This lab has no reference files.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Files">
              {files.map((f, i) => (
                <button
                  key={f.path}
                  type="button"
                  aria-pressed={i === active}
                  onClick={() => setActive(i)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 font-mono text-xs',
                    i === active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-fg-muted hover:bg-surface-muted',
                  )}
                >
                  {f.path}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{file.title}</p>
                {file.description ? <p className="text-sm text-fg-muted">{file.description}</p> : null}
              </div>
              <FileActions file={file} />
            </div>
            <CodeBlock code={file.code} language={file.language} label={`Source of ${file.path}`} />
            <p className="text-xs text-fg-subtle">
              Readonly. Path: packages/labs/src/{file.path.startsWith('shared/') ? file.path : `${definition.id}/${file.path}`}
            </p>
          </>
        )}
      </Section>

      <Section title="Exercise" id={`${definition.id}-source-exercise`}>
        <p className="max-w-3xl text-fg">{definition.exercise.instructions}</p>
        <Scratchpad labId={definition.id} />
      </Section>

      {solution ? (
        <Section title="Solution" id={`${definition.id}-source-solution`}>
          {revealed ? (
            <>
              <FileActions file={solution} />
              <CodeBlock code={solution.code} language={solution.language} label="Exercise solution" />
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setRevealed(false)}>
                Hide solution
              </Button>
            </>
          ) : revealConfirm ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <span>Try the exercise first. Reveal the solution anyway?</span>
              <Button size="sm" onClick={() => setRevealed(true)}>
                Yes, reveal
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealConfirm(false)}>
                Not yet
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="self-start" onClick={() => setRevealConfirm(true)}>
              Reveal solution
            </Button>
          )}
        </Section>
      ) : null}
    </div>
  );
}
