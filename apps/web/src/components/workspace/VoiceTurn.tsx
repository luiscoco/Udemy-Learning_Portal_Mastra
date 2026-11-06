import { VoiceTurnSchema, type VoiceTurn as Turn } from '@mlp/contracts';
import { Badge } from '../ui/primitives';
import { FormattedResponse } from './FormattedResponse';

export function voiceTurnOf(output: unknown): Turn | null {
  if (!output || typeof output !== 'object' || !('voice' in output)) return null;
  const parsed = VoiceTurnSchema.safeParse((output as { voice: unknown }).voice);
  return parsed.success ? parsed.data : null;
}

const STT: Record<Turn['services']['stt'], string> = {
  used: 'transcribed',
  unavailable: 'unavailable',
  failed: 'failed',
  'not-needed': 'not needed',
};
const TTS: Record<Turn['services']['tts'], string> = {
  used: 'spoken',
  unavailable: 'unavailable',
  failed: 'failed',
  'not-requested': 'not requested',
};

/** A voice turn (L69): what was heard, what was answered, the spoken reply, and any fallback. */
export function VoiceTurn({ turn }: { turn: Turn }) {
  return (
    <div className="flex flex-col gap-3" data-testid="voice-turn">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge>{turn.services.provider === 'openai' ? 'OpenAI voice (server)' : 'Offline voice simulator'}</Badge>
        <Badge>speech-to-text: {STT[turn.services.stt]}</Badge>
        <Badge>text-to-speech: {TTS[turn.services.tts]}</Badge>
        {turn.fallback.used ? <Badge>text fallback</Badge> : null}
      </div>
      {turn.transcript ? (
        <p className="text-sm">
          <span className="font-medium">Heard: </span>“{turn.transcript.text}”
          {turn.transcript.audioSeconds !== undefined ? (
            <span className="text-fg-subtle"> ({turn.transcript.audioSeconds} s)</span>
          ) : null}
        </p>
      ) : null}
      {turn.identifiers.some((i) => !i.confirmed) ? (
        <p className="text-sm text-warning" data-testid="voice-confirm">
          To confirm:{' '}
          {turn.identifiers
            .filter((i) => !i.confirmed)
            .map((i) => `“${i.heard}” → ${i.normalized}`)
            .join(', ')}
        </p>
      ) : null}
      {turn.needsText ? (
        <p role="alert" className="text-sm font-medium" data-testid="voice-needs-text">
          I could not get your question from the audio. Please type it in the message box and run again.
        </p>
      ) : (
        <div className="min-w-0 rounded-lg bg-surface-muted p-3 text-sm" data-testid="voice-answer">
          <FormattedResponse text={turn.answer ?? ''} />
        </div>
      )}
      {turn.audio ? (
        <audio
          controls
          aria-label="Spoken reply"
          data-testid="voice-audio"
          src={`data:${turn.audio.mimeType};base64,${turn.audio.base64}`}
          className="w-full max-w-md"
        />
      ) : null}
      {turn.fallback.used && turn.fallback.reason ? (
        <p className="text-xs text-fg-muted">Fallback: {turn.fallback.reason}</p>
      ) : null}
      {turn.notices.length ? (
        <ul className="list-disc pl-5 text-xs text-fg-muted" aria-label="Voice notices">
          {turn.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
