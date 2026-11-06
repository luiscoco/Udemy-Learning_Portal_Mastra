import { FormattedResponse } from './FormattedResponse';
import { useRef, useState } from 'react';
import { CitedAnswerSchema, type CitedAnswer as CitedAnswerData } from '@mlp/contracts';
import { Button, Card } from '../ui/primitives';

/** Parses a lab result's `citedAnswer`; anything that does not match the contract renders nothing. */
export function citedAnswerOf(output: unknown): CitedAnswerData | null {
  if (!output || typeof output !== 'object' || !('citedAnswer' in output)) return null;
  const parsed = CitedAnswerSchema.safeParse((output as { citedAnswer: unknown }).citedAnswer);
  return parsed.success ? parsed.data : null;
}

interface Open {
  n: number;
  sourceId: string;
  quoteStart: number;
  quoteEnd: number;
  trigger: HTMLButtonElement;
}

/**
 * Claims with numbered citations; each citation opens the source passage with the quoted span highlighted.
 * The passage is rendered as text (never as HTML), so a source cannot inject markup or script.
 */
export function CitedAnswer({ data, idPrefix }: { data: CitedAnswerData; idPrefix: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const source = open ? data.sources[open.sourceId] : undefined;
  const headingId = `${idPrefix}-source-title`;

  const show = (o: Open) => {
    setOpen(o);
    queueMicrotask(() => dialog.current?.showModal());
  };
  const close = () => dialog.current?.close();

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="cited-answer">
      {data.fallback ? (
        <p className="text-sm text-fg-muted" role="status">
          No claim could be verified against the sources, so no answer is shown.
        </p>
      ) : null}
      {data.claims.length > 0 ? (
        <ol className="flex list-decimal flex-col gap-2 pl-5" aria-label="Answer claims">
          {data.claims.map((c, i) => (
            <li key={i} className="min-w-0 text-fg [overflow-wrap:anywhere]">
              <FormattedResponse text={c.text} />{' '}
              {c.citations.map((cit) => (
                <button
                  key={`${cit.n}-${cit.sourceId}`}
                  type="button"
                  className="mx-0.5 rounded px-1 align-super text-xs font-semibold text-accent underline underline-offset-2"
                  aria-label={`Open source ${cit.n}: ${data.sources[cit.sourceId]?.title ?? cit.sourceId}`}
                  aria-haspopup="dialog"
                  onClick={(e) =>
                    show({
                      n: cit.n,
                      sourceId: cit.sourceId,
                      quoteStart: cit.quoteStart,
                      quoteEnd: cit.quoteEnd,
                      trigger: e.currentTarget,
                    })
                  }
                >
                  [{cit.n}]
                </button>
              ))}
            </li>
          ))}
        </ol>
      ) : null}
      {data.blocked.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-fg">Blocked claims</h4>
          <ul className="mt-1 flex flex-col gap-1 text-sm" aria-label="Blocked claims">
            {data.blocked.map((b, i) => (
              <li key={i} className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-fg-muted line-through">{b.text}</span>{' '}
                <span className="text-danger">({b.reasons.join('; ')})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onClose={() => {
          open?.trigger.focus();
          setOpen(null);
        }}
        className="w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-fg backdrop:bg-black/50"
      >
        {open && source ? (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={headingId} className="text-base font-semibold [overflow-wrap:anywhere]">
                  Source {open.n}: {source.title}
                </h3>
                <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">{source.location}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={close}>
                Close
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]" data-testid="source-passage">
              {source.text.slice(0, open.quoteStart)}
              <mark className="rounded bg-warning-soft px-0.5 text-fg outline outline-1 outline-warning">
                {source.text.slice(open.quoteStart, open.quoteEnd)}
              </mark>
              {source.text.slice(open.quoteEnd)}
            </p>
          </div>
        ) : null}
      </dialog>
    </Card>
  );
}
