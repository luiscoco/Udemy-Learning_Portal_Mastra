import { useEffect, useRef, useState } from 'react';
import type { LabDefinition } from '@mlp/contracts';
import { downloadText } from '../../lib/download';
import type { TeachingExcerpt } from '../../features/visual-guides/content';
import { Button } from '../ui/primitives';
import { LessonPoster, POSTER_HEIGHT, POSTER_WIDTH } from './LessonPoster';
import './visual-guides.css';

/** SVG contains only local vector shapes and escaped text; there are no external image/font requests. */
export async function posterPng(svg: SVGSVGElement): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cannot render image'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PosterViewer({
  definition,
  kind,
  excerpt,
  selected,
  transcript,
  active,
}: {
  definition: LabDefinition;
  kind: 'infographic' | 'walkthrough';
  excerpt: TeachingExcerpt | null;
  selected: number;
  transcript: string;
  active: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const full = useRef<HTMLDialogElement>(null);
  const fullButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (!active && full.current?.open) full.current.close();
  }, [active]);
  const close = () => {
    full.current?.close();
    setFullscreen(false);
    fullButton.current?.focus();
  };
  const changeZoom = (amount: number) => setZoom((current) => Math.max(0.25, Math.min(2, (current ?? 0.75) + amount)));
  const savePng = async () => {
    if (!svg.current || exporting) return;
    setExporting(true);
    setNotice('');
    try {
      const blob = await posterPng(svg.current);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${definition.id}-${kind}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice('PNG downloaded');
    } catch {
      setNotice('PNG export is unavailable. Download SVG or text instead.');
    } finally {
      setExporting(false);
    }
  };
  const toolbar = (large = false) => (
    <div className="poster-tools" aria-label={large ? 'Fullscreen image controls' : 'Image controls'}>
      <Button variant="secondary" disabled={zoom === 0.25} onClick={() => changeZoom(-0.25)}>
        Zoom out
      </Button>
      <output aria-label={large ? 'Fullscreen zoom level' : 'Zoom level'}>
        {zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}
      </output>
      <Button variant="secondary" disabled={zoom === 2} onClick={() => changeZoom(0.25)}>
        Zoom in
      </Button>
      <Button
        variant="secondary"
        aria-pressed={zoom === null}
        onClick={() => {
          setZoom(null);
          viewport.current?.scrollTo?.(0, 0);
        }}
      >
        Fit
      </Button>
      <Button variant="secondary" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>
        100%
      </Button>
      {large ? (
        <Button variant="secondary" onClick={close}>
          Close fullscreen
        </Button>
      ) : (
        <Button
          ref={fullButton}
          variant="secondary"
          aria-haspopup="dialog"
          onClick={() => {
            setFullscreen(true);
            full.current?.showModal();
          }}
        >
          Fullscreen
        </Button>
      )}
    </div>
  );
  const art = (large = false) => (
    <div
      ref={large ? undefined : viewport}
      className={`poster-viewport ${zoom === null ? 'poster-fit' : ''}`}
      role="region"
      aria-label={large ? 'Fullscreen infographic' : 'Scrollable infographic'}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0 || zoom === null) return;
        const el = event.currentTarget;
        drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
        el.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
        event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <div className="poster-stage" style={{ width: zoom === null ? '100%' : `${POSTER_WIDTH * zoom}px` }}>
        <LessonPoster
          definition={definition}
          kind={kind}
          excerpt={excerpt}
          selected={selected}
          svgRef={large ? undefined : svg}
        />
      </div>
    </div>
  );
  return (
    <div className="poster-viewer">
      {toolbar()}
      <p className="text-xs text-fg-muted">
        Zoom to inspect code. Drag to pan when zoomed, or focus the image area and use arrow keys to scroll.
      </p>
      {art()}
      <div className="poster-tools">
        <Button
          variant="secondary"
          onClick={() => {
            try {
              if (!svg.current) throw new Error('Not ready');
              downloadText(`${definition.id}-${kind}.svg`, new XMLSerializer().serializeToString(svg.current), 'image/svg+xml');
              setNotice('SVG downloaded');
            } catch {
              setNotice('SVG export is unavailable. Download text instead.');
            }
          }}
        >
          Download SVG
        </Button>
        <Button variant="secondary" disabled={exporting} onClick={() => void savePng()}>
          {exporting ? 'Exporting PNG…' : 'Download PNG'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            try {
              downloadText(`${definition.id}-${kind}.md`, transcript, 'text/markdown');
              setNotice('Text downloaded');
            } catch {
              setNotice('Text download unavailable. Select and copy the summary below.');
            }
          }}
        >
          Download text
        </Button>
        <span role="status" aria-label="Image export status" className="text-xs text-fg-muted">
          {notice}
        </span>
      </div>
      <dialog
        ref={full}
        className="poster-dialog"
        aria-label={`${definition.id} ${kind === 'infographic' ? 'concept map' : 'exercise walkthrough'} fullscreen`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setFullscreen(false)}
      >
        {fullscreen ? (
          <>
            <h2 className="text-lg font-bold">{definition.title}</h2>
            {toolbar(true)}
            {art(true)}
          </>
        ) : null}
      </dialog>
    </div>
  );
}
