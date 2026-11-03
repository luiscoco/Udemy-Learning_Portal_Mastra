import { useEffect, useRef, useState } from 'react';
import type { UploadedFile } from '@mlp/contracts';

const MAX_SECONDS = 30;

/** Is in-browser recording possible here? (MediaRecorder + getUserMedia) */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Microphone recorder for a file input (L69). It explains where the audio goes BEFORE the browser asks for
 * permission, records only after an explicit click, stops at 30 s, and hands the recording to the form as a
 * file. It never talks to a voice provider: the server does that.
 */
export function MicRecorder({ disabled, onRecorded }: { disabled: boolean; onRecorded: (file: UploadedFile) => void }) {
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(
    () => () => {
      clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  if (!canRecord())
    return (
      <p className="text-xs text-fg-muted" data-testid="recorder-unsupported">
        Recording is not supported in this browser — upload a file or type your question instead.
      </p>
    );

  const start = async () => {
    setError(null);
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported?.('audio/webm') ? { mimeType: 'audio/webm' } : undefined,
      );
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = async () => {
        clearInterval(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        onRecorded({
          name: `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
          type: blob.type,
          size: bytes.length,
          dataBase64: btoa(binary),
        });
        setState('idle');
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setState('recording');
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) rec.stop();
          return s + 1;
        });
      }, 1_000);
    } catch (err) {
      setState('error');
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Upload a file or type instead.'
          : 'The microphone could not be started. Upload a file or type instead.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2" data-testid="mic-recorder">
      <p className="text-xs text-fg-muted" id="mic-notice">
        Your browser will ask for microphone access. The recording is sent to this platform’s server and, in live mode with the
        OpenAI voice, to OpenAI, which may bill for transcription. Nothing is recorded until you press Record.
      </p>
      <div className="flex items-center gap-2">
        {state === 'recording' ? (
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className="rounded-lg border border-danger px-3 py-1 text-sm font-medium text-danger"
          >
            Stop recording ({seconds}s)
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || state === 'asking'}
            aria-describedby="mic-notice"
            onClick={() => void start()}
            className="rounded-lg border border-border-strong px-3 py-1 text-sm font-medium"
          >
            {state === 'asking' ? 'Waiting for permission…' : 'Record with microphone'}
          </button>
        )}
        <span role="status" className="text-xs text-danger">
          {error ?? ''}
        </span>
      </div>
    </div>
  );
}
