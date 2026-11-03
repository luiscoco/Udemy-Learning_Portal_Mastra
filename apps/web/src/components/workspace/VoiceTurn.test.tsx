import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile, VoiceTurn as Turn } from '@mlp/contracts';
import { MicRecorder } from './MicRecorder';
import { VoiceTurn, voiceTurnOf } from './VoiceTurn';

const turn: Turn = {
  source: 'audio',
  transcript: { text: 'when will Ority 5002 arrive?', provider: 'openai' },
  usedText: 'when will Ority 5002 arrive?',
  identifiers: [{ heard: 'Ority 5002', normalized: 'ORD-5002', confirmed: false }],
  services: { provider: 'openai', stt: 'used', tts: 'used' },
  fallback: { used: false },
  answer: 'I understood order ORD-5002. Please confirm that is right before I act on it. It is packing.',
  needsText: false,
  audio: { mimeType: 'audio/mpeg', base64: 'SUQz', bytes: 3 },
  usage: { speechCharacters: 90 },
  notices: ['Audio is sent to this platform’s server and from there to OpenAI. The key stays on the server.'],
};

afterEach(() => vi.unstubAllGlobals());

describe('VoiceTurn', () => {
  it('shows what was heard, the id to confirm, the answer and a player for the spoken reply', () => {
    expect(voiceTurnOf({ voice: turn })).toEqual(turn);
    expect(voiceTurnOf({ voice: { nope: true } })).toBeNull();
    render(<VoiceTurn turn={turn} />);
    expect(screen.getByText(/Heard:/).closest('p')?.textContent).toContain('Ority 5002');
    expect(screen.getByTestId('voice-confirm')).toHaveTextContent('“Ority 5002” → ORD-5002');
    expect(screen.getByLabelText('Spoken reply')).toHaveAttribute('src', 'data:audio/mpeg;base64,SUQz');
  });
  it('asks to type when nothing could be understood', () => {
    render(
      <VoiceTurn
        turn={{
          ...turn,
          transcript: undefined,
          usedText: null,
          answer: null,
          needsText: true,
          audio: undefined,
          services: { ...turn.services, stt: 'failed' },
          fallback: { used: true, reason: 'No transcript and nothing typed' },
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Please type it');
    expect(screen.queryByLabelText('Spoken reply')).toBeNull();
  });
});

describe('MicRecorder', () => {
  it('says recording is unsupported when the browser has no MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    render(<MicRecorder disabled={false} onRecorded={() => undefined} />);
    expect(screen.getByTestId('recorder-unsupported')).toHaveTextContent('upload a file or type');
  });

  it('shows the notice first, records only after a click, and hands over a webm file', async () => {
    const user = userEvent.setup();
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    class FakeRecorder {
      static isTypeSupported = () => true;
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      stream: { getTracks: () => { stop: () => void }[] };
      constructor(stream: { getTracks: () => { stop: () => void }[] }) {
        this.stream = stream;
      }
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    const got: UploadedFile[] = [];
    render(<MicRecorder disabled={false} onRecorded={(f) => got.push(f)} />);
    expect(screen.getByText(/Your browser will ask for microphone access/)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled(); // nothing before the click
    await user.click(screen.getByRole('button', { name: 'Record with microphone' }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    await user.click(await screen.findByRole('button', { name: /Stop recording/ }));
    await waitFor(() => expect(got).toHaveLength(1));
    expect(got[0]).toMatchObject({ type: 'audio/webm', size: 4, dataBase64: btoa(String.fromCharCode(0x1a, 0x45, 0xdf, 0xa3)) });
    expect(track.stop).toHaveBeenCalled();
  });

  it('explains a denied permission and keeps the other ways in', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }))),
      },
    });
    vi.stubGlobal('MediaRecorder', class {});
    render(<MicRecorder disabled={false} onRecorded={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Record with microphone' }));
    expect(await screen.findByText('Microphone access was denied. Upload a file or type instead.')).toBeInTheDocument();
  });
});
