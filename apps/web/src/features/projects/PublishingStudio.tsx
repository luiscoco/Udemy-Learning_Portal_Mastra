import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabDefinition } from '@mlp/contracts';
import { questionShortcuts, type ProjectTopic } from '@mlp/lab-catalog';
import { ProjectAnswer } from './ProjectAnswer';
import type { ProjectState } from './state';
import {
  answerMarkdown,
  infographicPng,
  makeDocx,
  makeInfographic,
  makePdf,
  provenance,
  readImageStyle,
  type ImageStyle,
} from './artifacts';
import { downloadBytes } from './starters';
import { downloadText } from '../../lib/download';
import { FormattedResponse } from '../../components/workspace/FormattedResponse';
import { Button } from '../../components/ui/primitives';

export function PublishingStudio({
  definition,
  topic,
  data,
  update,
}: {
  definition: LabDefinition;
  topic: ProjectTopic;
  data: ProjectState;
  update: (fn: (state: ProjectState) => ProjectState) => void;
}) {
  const [selectedId, setSelectedId] = useState(data.answers[0]?.id ?? '');
  const [style, setStyle] = useState<ImageStyle>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.abort();
    };
  }, []);
  const selected = data.answers.find((a) => a.id === selectedId) ?? data.answers[0];
  const svg = useMemo(() => (selected ? makeInfographic(selected, style) : ''), [selected, style]);
  const preview = useMemo(() => (svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : ''), [svg]);
  async function exportArtifact(format: 'docx' | 'pdf' | 'md' | 'svg' | 'png') {
    if (!selected || busy) return;
    const answer = selected,
      name = 'mastra-' + answer.labId + '-' + answer.id;
    const ctrl = new AbortController();
    pending.current = ctrl;
    setBusy(true);
    setError('');
    setStatus('Building ' + format.toUpperCase() + '...');
    try {
      if (format === 'md') downloadText(name + '.md', answerMarkdown(answer), 'text/markdown');
      if (format === 'svg') downloadText(name + '.svg', svg, 'image/svg+xml');
      if (format === 'docx')
        downloadBytes(
          name + '.docx',
          makeDocx(answer),
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
      if (format === 'pdf') {
        const bytes = await makePdf(answer, ctrl.signal);
        if (!ctrl.signal.aborted) downloadBytes(name + '.pdf', bytes, 'application/pdf');
      }
      if (format === 'png') {
        const bytes = await infographicPng(svg);
        if (!ctrl.signal.aborted) downloadBytes(name + '.png', bytes, 'image/png');
      }
      if (active.current && !ctrl.signal.aborted) setStatus('Downloaded ' + format.toUpperCase() + ' for answer ' + answer.id);
    } catch (err) {
      if (active.current && !ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Artifact export failed.');
    } finally {
      if (active.current && !ctrl.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="project-stack">
      <ProjectAnswer
        definition={definition}
        topic={topic.title}
        initialQuestion={questionShortcuts(topic.title)[2]!}
        shortcuts={questionShortcuts(topic.title)}
        onComplete={(answer) => {
          update((old) => ({ ...old, answers: [answer, ...old.answers].slice(0, 10) }));
          setSelectedId(answer.id);
        }}
      />
      <section className="project-panel">
        <h2>Publish a selected answer</h2>
        <p>
          Only completed answers appear here. The latest 10 are saved for this learner in this browser. Editing a question never
          changes a selected response. Exports cost no provider tokens.
        </p>
        <label>
          Selected completed answer
          <select
            disabled={busy || !data.answers.length}
            value={selected?.id ?? ''}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setStatus('');
            }}
          >
            {!data.answers.length && <option value="">Ask the coach to create a completed answer</option>}
            {data.answers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.topic} - {a.mode} - {a.at}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <p data-testid="selected-answer-provenance">{provenance(selected)}</p>
            <FormattedResponse text={selected.text} />
          </>
        )}
        <div className="project-actions">
          {(['md', 'docx', 'pdf', 'svg', 'png'] as const).map((format) => (
            <Button variant="secondary" key={format} disabled={!selected || busy} onClick={() => void exportArtifact(format)}>
              Download {format.toUpperCase()}
            </Button>
          ))}
        </div>
        <p>
          Word contains editable text and coloured code. PDF uses paginated image-based pages to preserve Unicode and code
          colours; its text is not searchable. SVG/PNG show a labelled excerpt; use Word/PDF for the complete answer.
        </p>
        <label>
          PNG style reference (local only)
          <input
            type="file"
            accept="image/png"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError('');
              void readImageStyle(file)
                .then((value) => {
                  if (active.current) setStyle(value);
                })
                .catch((err: unknown) => {
                  if (active.current) setError(err instanceof Error ? err.message : 'Invalid reference.');
                });
              e.target.value = '';
            }}
          />
        </label>
        <p>
          Maximum 2 MB and 4096 px per side. Palette and artwork are adapted locally and approximately; no model sees the image
          and no AI image is generated.
        </p>
        {style && (
          <Button variant="ghost" onClick={() => setStyle(undefined)}>
            Remove style reference
          </Button>
        )}
        {preview && (
          <img
            className="project-artifact-preview"
            alt={'Infographic excerpt for selected answer ' + selected?.id}
            src={preview}
          />
        )}
        <p role="status" data-testid="artifact-status">
          {status}
        </p>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
