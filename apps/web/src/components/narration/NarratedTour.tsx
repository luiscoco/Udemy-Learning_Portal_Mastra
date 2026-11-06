import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { LabDefinition, SourceFile } from '@mlp/contracts';
import { tourModel, type TourKind, type TourModel } from '../../features/narration/content';
import { verifiedClip, type TourClip } from '../../features/narration/media';
import { teachingExcerpt } from '../../features/visual-guides/content';
import { downloadText } from '../../lib/download';
import { Button } from '../ui/primitives';
import { CodeBlock } from '../workspace/CodeBlock';
import { FormattedResponse } from '../workspace/FormattedResponse';
import { LessonPoster } from '../workspace/LessonPoster';
import './narration.css';

const EMPTY: SourceFile[] = [];
/** Scroll only the relevant reader. Audio following never moves keyboard focus away from controls. */
export function revealNarratedTarget(reader: HTMLElement, target: Element) {
  const area = reader.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  if (box.top < area.top + 12 || box.bottom > area.bottom - 12) reader.scrollTop += box.top - area.top - 18;
  if (box.left < area.left || box.right > area.right) reader.scrollLeft += box.left - area.left - 12;
}
export function NarratedTour({
  definition,
  kind,
  files = EMPTY,
}: {
  definition: LabDefinition;
  kind: TourKind;
  files?: SourceFile[];
}) {
  const [open, setOpen] = useState(false);
  const launch = useRef<HTMLButtonElement>(null);
  const model = useMemo(() => tourModel(definition, kind, files), [definition, kind, files]);
  return (
    <div className="narration-launch">
      <div>
        <strong>Listen · Read · Explore</strong>
        <p>Guided Narrated Learning Tour · recorded Inworld Yash voice. Listening does not run or complete this exercise.</p>
      </div>
      <Button ref={launch} disabled={!model.steps.length} onClick={() => setOpen(true)}>
        Start Guided Narrated Learning Tour
      </Button>
      {open ? (
        <TourReader
          model={model}
          definition={definition}
          files={files}
          onClose={() => {
            setOpen(false);
            launch.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
const TourStage = memo(function TourStage({
  model,
  definition,
  files,
  index,
  follow,
}: {
  model: TourModel;
  definition: LabDefinition;
  files: SourceFile[];
  index: number;
  follow: boolean;
}) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [wrap, setWrap] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const step = model.steps[index]!;
  useEffect(() => {
    if (!follow || !viewport.current) return;
    const target = viewport.current.querySelector('[data-tour-focus], [data-exercise-focus]');
    if (target) revealNarratedTarget(viewport.current, target);
  }, [index, follow, zoom]);
  if (model.kind === 'source' && model.file)
    return (
      <div className={`tour-source ${wrap ? 'tour-wrap' : ''}`}>
        <div className="tour-options">
          <label>
            <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap code
          </label>
          <span>
            {model.file.path} · lines {step.lines?.join('–')}
          </span>
        </div>
        <p className="tour-small">
          Main non-solution reference. Surrounding setup remains visible. Red boundaries mark the narrated source range.
        </p>
        <CodeBlock
          code={model.file.code}
          language={model.file.language}
          label="Narrated TypeScript source"
          highlightRange={step.lines}
          follow={follow}
        />
      </div>
    );
  if (model.kind === 'exercise')
    return (
      <div
        ref={viewport}
        className="tour-visual-viewport tour-exercise"
        role="region"
        aria-label="Narrated exercise sections"
        tabIndex={0}
      >
        {model.steps.map((item, i) => (
          <section
            key={item.id}
            data-exercise-focus={i === index ? 'true' : undefined}
            className={i === index ? 'tour-red-focus' : ''}
          >
            <h3>
              {i + 1}. {item.title}
            </h3>
            <p>{item.text}</p>
            {i === 2 ? (
              <>
                <p>Teaching baseline; your current Run inputs are preserved.</p>
                <CodeBlock code={JSON.stringify(definition.exampleInput, null, 2)} language="json" label="Tour example input" />
              </>
            ) : null}
            {i === 3 ? (
              <ul>
                {definition.checks.map((c) => (
                  <li key={c.id}>{c.label}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    );
  const excerpt = teachingExcerpt(definition, files);
  return (
    <div>
      <div className="tour-options">
        <Button variant="secondary" onClick={() => setZoom((z) => Math.max(0.25, (z ?? 0.75) - 0.25))}>
          Zoom out
        </Button>
        <Button variant="secondary" onClick={() => setZoom((z) => Math.min(2, (z ?? 0.75) + 0.25))}>
          Zoom in
        </Button>
        <Button variant="secondary" aria-pressed={zoom === null} onClick={() => setZoom(null)}>
          Fit image
        </Button>
        <Button variant="secondary" onClick={() => setZoom(1)}>
          100%
        </Button>
      </div>
      <div ref={viewport} className="tour-visual-viewport" role="region" aria-label="Narrated infographic image" tabIndex={0}>
        <div style={{ width: zoom === null ? '100%' : `${1920 * zoom}px` }}>
          <LessonPoster
            definition={definition}
            kind={model.kind === 'walkthrough' ? 'walkthrough' : 'infographic'}
            excerpt={excerpt}
            selected={index}
            focusRect={step.rect}
          />
        </div>
      </div>
    </div>
  );
});

function TourReader({
  model,
  definition,
  files,
  onClose,
}: {
  model: TourModel;
  definition: LabDefinition;
  files: SourceFile[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const objectUrl = useRef('');
  const loadedIndex = useRef(-1);
  const frame = useRef(0);
  const caption = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [clip, setClip] = useState<TourClip | null>(null);
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('Press Play narration to listen to this section.');
  const [clock, setClock] = useState(0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);
  const [auto, setAuto] = useState(false);
  const step = model.steps[index]!;
  const exercise = model.kind === 'exercise' || model.kind === 'walkthrough';
  const word = clip?.words.findLastIndex((w) => clock >= w.start && clock <= w.end) ?? -1;
  useEffect(() => {
    dialog.current?.showModal();
    const player = audio.current;
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Numeric generation token invalidates the latest pending request, not a DOM node.
      generation.current++;
      request.current?.abort();
      cancelAnimationFrame(frame.current);
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    if (!follow || word < 0 || !caption.current) return;
    const target = caption.current.querySelector('[data-current-word="true"]');
    if (target) revealNarratedTarget(caption.current, target);
  }, [word, follow]);
  useEffect(() => {
    if (!follow || !playing || window.innerWidth > 760) return;
    const scheduled = requestAnimationFrame(() => {
      const box = dialog.current;
      const reader = box?.querySelector<HTMLElement>('.tour-reader-grid');
      const header = box?.querySelector<HTMLElement>('.tour-header');
      if (!box || !reader || !header) return;
      const top = reader.getBoundingClientRect().top - box.getBoundingClientRect().top;
      box.scrollTop += top - header.getBoundingClientRect().height - 16;
    });
    return () => cancelAnimationFrame(scheduled);
  }, [follow, playing, index]);
  function stop(release = true) {
    generation.current++;
    request.current?.abort();
    request.current = null;
    cancelAnimationFrame(frame.current);
    audio.current?.pause();
    setPlaying(false);
    setLoading(false);
    if (release) {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
      setUrl('');
      loadedIndex.current = -1;
      setClip(null);
      setClock(0);
      if (audio.current) {
        audio.current.removeAttribute('src');
        audio.current.load();
      }
    }
  }
  function tick() {
    const player = audio.current;
    if (!player) return;
    setClock(player.currentTime);
    cancelAnimationFrame(frame.current);
    if (!player.paused) frame.current = requestAnimationFrame(tick);
  }
  async function play(target = index, replay = false) {
    if (!audio.current) return;
    const own = ++generation.current;
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setNotice('');
    try {
      if (loadedIndex.current !== target || !objectUrl.current) {
        setLoading(true);
        const deadline = setTimeout(() => ctrl.abort(), 30_000);
        let verified: Awaited<ReturnType<typeof verifiedClip>>;
        try {
          verified = await verifiedClip(model, target, ctrl.signal);
        } finally {
          clearTimeout(deadline);
        }
        if (ctrl.signal.aborted || own !== generation.current) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(verified.blob);
        setUrl(objectUrl.current);
        loadedIndex.current = target;
        audio.current.src = objectUrl.current;
        setClip(verified.clip);
        setClock(0);
      }
      if (replay) audio.current.currentTime = 0;
      audio.current.playbackRate = rate;
      await audio.current.play();
    } catch {
      if (own === generation.current) {
        setPlaying(false);
        setNotice(
          'Narration could not play or does not match the current content. Retry Play narration, or read the transcript and use Next section.',
        );
      }
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }
  function choose(next: number, speak = playing) {
    stop();
    setIndex(next);
    setNotice('');
    if (speak) void play(next, true);
  }
  function closeReader() {
    stop();
    dialog.current?.close();
    onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="narrated-tour-dialog"
      aria-label={`${definition.id} Guided Narrated Learning Tour`}
      onCancel={(e) => {
        e.preventDefault();
        closeReader();
      }}
    >
      <header className="tour-header">
        <div>
          <p className="tour-eyebrow">GUIDED NARRATED LEARNING TOUR</p>
          <h2>{model.title}</h2>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            closeReader();
          }}
        >
          Close tour
        </Button>
        <div className="tour-mobile-follow-controls">
          {playing ? (
            <Button size="sm" variant="secondary" onClick={() => stop(false)}>
              Pause followed audio
            </Button>
          ) : (
            <Button size="sm" disabled={loading} onClick={() => void play()}>
              Resume followed audio
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => dialog.current?.scrollTo?.({ top: 0 })}>
            Back to controls
          </Button>
        </div>
      </header>
      <div className="tour-reader-controls">
        <label>
          Tour section
          <select value={index} onChange={(e) => choose(Number(e.target.value))} aria-label="Tour section">
            {model.steps.map((s, i) => (
              <option key={s.id} value={i}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="tour-options">
          <Button variant="secondary" disabled={index === 0} onClick={() => choose(index - 1)}>
            Previous section
          </Button>
          <Button variant="secondary" disabled={index === model.steps.length - 1} onClick={() => choose(index + 1)}>
            Next section
          </Button>
          <Button disabled={loading || playing} onClick={() => void play()}>
            Play narration
          </Button>
          <Button variant="secondary" disabled={!playing && !loading} onClick={() => stop(false)}>
            Pause narration
          </Button>
          <Button variant="secondary" disabled={loading} onClick={() => void play(index, true)}>
            Replay narration
          </Button>
        </div>
        <div className="tour-options">
          <label>
            Playback speed
            <select
              aria-label="Tour playback speed"
              value={rate}
              onChange={(e) => {
                const n = Number(e.target.value);
                setRate(n);
                if (audio.current) audio.current.playbackRate = n;
              }}
            >
              {[0.75, 1, 1.25, 1.5].map((n) => (
                <option key={n} value={n}>
                  {n}× recording
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow narration
          </label>
          {!exercise ? (
            <label>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Continue after audio
            </label>
          ) : (
            <span className="tour-small">Exercise sections wait for your Next action.</span>
          )}
        </div>
        <p className="tour-small">
          Inworld Yash · TTS 2 · Enhanced · Balanced · recorded at 1.25× · MP3, 48 kHz. Readonly teaching content.
        </p>
        <p role="status" className="tour-notice">
          {loading
            ? 'Checking recorded MP3…'
            : notice || `${playing ? 'Playing' : 'Paused'} · section ${index + 1} of ${model.steps.length}`}
        </p>
        <audio
          ref={audio}
          controls
          preload="none"
          aria-label="Guided tour recorded narration"
          onPlay={() => {
            setPlaying(true);
            document.querySelectorAll('audio').forEach((a) => {
              if (a !== audio.current) a.pause();
            });
            tick();
          }}
          onPause={() => {
            setPlaying(false);
            cancelAnimationFrame(frame.current);
            if (audio.current) setClock(audio.current.currentTime);
          }}
          onTimeUpdate={() => {
            if (audio.current) setClock(audio.current.currentTime);
          }}
          onSeeked={tick}
          onEnded={() => {
            cancelAnimationFrame(frame.current);
            setPlaying(false);
            if (auto && !exercise && index < model.steps.length - 1) choose(index + 1, true);
            else
              setNotice(
                index === model.steps.length - 1
                  ? 'Tour complete. Revisit a section or close and practise yourself.'
                  : 'Section complete. Continue when ready.',
              );
          }}
          onError={() => {
            if (objectUrl.current) setNotice('This MP3 could not be decoded. Read the transcript or retry playback.');
          }}
        />
      </div>
      <div className="tour-reader-grid">
        <div className="tour-stage">
          <TourStage model={model} definition={definition} files={files} index={index} follow={follow} />
        </div>
        <aside className="tour-caption-panel">
          <h3 aria-live="polite">
            {index + 1}. {step.title}
          </h3>
          <div ref={caption} className="tour-caption-scroll" role="region" aria-label="Timed narration captions" tabIndex={0}>
            {clip ? (
              <p className="tour-spoken-caption" aria-label="Spoken caption with timed focus">
                {clip.words.map((w, i) => (
                  <span key={i} data-current-word={i === word ? 'true' : undefined}>
                    {w.text}{' '}
                  </span>
                ))}
              </p>
            ) : null}
            <div className="tour-red-focus">
              <p className="tour-small">Complete section transcript</p>
              <FormattedResponse text={step.text} />
            </div>
          </div>
          <div className="tour-options">
            {clip && url ? (
              <a href={url} download={`${model.lesson}-${model.kind}-${step.id}.mp3`}>
                Download section MP3
              </a>
            ) : null}
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(
                  `${model.lesson}-${model.kind}-tour.md`,
                  model.steps.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.text}`).join('\n\n'),
                  'text/markdown',
                )
              }
            >
              Download transcript
            </Button>
          </div>
        </aside>
      </div>
    </dialog>
  );
}
