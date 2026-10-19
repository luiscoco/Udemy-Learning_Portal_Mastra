import type { AnyExportedSpan, TracingEvent } from '@mastra/core/observability';
import { BaseExporter } from '@mastra/observability';

/**
 * An in-process exporter: keeps every tracing event of one lab run and reports each ended span as it
 * arrives (so spans appear in the log while the run is still going).
 */
export class SpanCollector extends BaseExporter {
  name = 'lab-span-collector';
  readonly events: TracingEvent[] = [];

  constructor(private readonly onEnded?: (span: AnyExportedSpan) => void) {
    super();
  }

  protected async _exportTracingEvent(event: TracingEvent): Promise<void> {
    this.events.push(event);
    if (event.type === 'span_ended') this.onEnded?.(event.exportedSpan);
  }
}

export interface Lifecycle {
  /** The latest version of every span, by id. */
  spans: Map<string, AnyExportedSpan>;
  started: Set<string>;
  ended: Set<string>;
  /** Spans that started but never ended. */
  missingEnd: string[];
  /** Non-event spans that ended without a start event. */
  endedWithoutStart: string[];
  /** Spans that ended more than once. */
  endedTwice: string[];
}

/** Checks each span's lifecycle from the raw events. Event spans (isEvent) legitimately end without a start. */
export function analyseLifecycle(events: readonly TracingEvent[]): Lifecycle {
  const spans = new Map<string, AnyExportedSpan>();
  const started = new Set<string>();
  const ended = new Set<string>();
  const endedTwice: string[] = [];
  for (const e of events) {
    const s = e.exportedSpan;
    spans.set(s.id, s);
    if (e.type === 'span_started') started.add(s.id);
    if (e.type === 'span_ended') {
      if (ended.has(s.id)) endedTwice.push(s.id);
      ended.add(s.id);
    }
  }
  return {
    spans,
    started,
    ended,
    missingEnd: [...started].filter((id) => !ended.has(id)),
    endedWithoutStart: [...ended].filter((id) => !started.has(id) && !spans.get(id)?.isEvent),
    endedTwice,
  };
}
