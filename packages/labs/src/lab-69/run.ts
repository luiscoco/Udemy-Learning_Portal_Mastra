import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, UploadedFileSchema, type LabDefinition, type VoiceTurn } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { lab69Definition } from './definition.js';
import { confirmIdentifiers, ORDERS } from './identifiers.js';
import { resolveVoice, sniffAudio, wavSeconds, type AudioType, type VoicePort } from './voice.js';

export const SAMPLES = {
  status: 'Where is my order ORD-5001?',
  misheard: 'Hi, can you tell me when Ority 5002 will arrive?',
  general: 'What can you help me with?',
} as const;
export const MAX_AUDIO_BYTES = 1_000_000;
export const MAX_SPEECH_CHARS = 600;
const SPEAKERS = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'] as const;

export const Lab69InputSchema = z.object({
  message: z.string().trim().max(1_000).default(''),
  audioSource: z.enum(['none', 'sample', 'upload']),
  sample: z.enum(['status', 'misheard', 'general']).default('status'),
  audio: z.array(UploadedFileSchema).max(1).default([]),
  speakReply: z.boolean(),
  voice: z.enum(['offline', 'openai']),
  speaker: z.enum(SPEAKERS).default('alloy'),
  fault: z.enum(['none', 'stt-down', 'tts-down']).default('none'),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab69Input = z.infer<typeof Lab69InputSchema>;

export interface Lab69Output {
  voice: VoiceTurn;
  simulated: boolean;
}

export const INSTRUCTIONS =
  'You are a voice support assistant for an online shop. Answer in at most two short sentences, suitable to be read aloud. ' +
  'Known orders: ' +
  Object.entries(ORDERS)
    .map(([id, o]) => `${id}: ${o.item}, ${o.status}, expected ${o.eta}`)
    .join('; ') +
  '. If the user’s order id was not heard exactly, name the id you understood and ask them to confirm it.';

/** Offline desk model: answers from the order table (confirmation of unclear ids is added by the lab, not the model). */
export function deskScript() {
  return (v: PromptView): ScriptedTurn => {
    const id = confirmIdentifiers(v.lastUser)[0];
    if (!id) return { text: 'I can check an order for you: tell me its number, for example ORD-5001.' };
    const o = ORDERS[id.normalized];
    return { text: o ? `${id.normalized} (${o.item}) is ${o.status} and expected ${o.eta}.` : `I cannot find ${id.normalized}.` };
  };
}

/** The confirmation is enforced in code: a model may or may not follow an instruction to ask (a live run did not). */
export const confirmationLine = (ids: { normalized: string; confirmed: boolean }[]) => {
  const unclear = ids.filter((i) => !i.confirmed).map((i) => i.normalized);
  return unclear.length ? `I understood order ${unclear.join(' and ')}. Please confirm that is right before I act on it. ` : '';
};

const failing = (what: string) => async () => Promise.reject(new Error(`${what} is down (fault injection)`));

export const lab69: LabImplementation<Lab69Input, Lab69Output, LabServices> = {
  definition: lab69Definition as LabDefinition,
  inputSchema: Lab69InputSchema,

  async run(ctx, input) {
    const notices: string[] = [];
    const openAiConfigured = ctx.services.models.liveModels.some((m) => m.id.startsWith('openai/') && m.configured);
    const { port: resolvedPort, reason } = resolveVoice(input.voice, ctx.mode, openAiConfigured, input.speaker);
    let port: VoicePort | null = resolvedPort;
    if (port && input.fault !== 'none')
      port = {
        ...port,
        ...(input.fault === 'stt-down' ? { listen: failing('Speech-to-text') } : { speak: failing('Text-to-speech') }),
      };
    const provider = input.voice;
    if (provider === 'openai')
      notices.push('Audio is sent to this platform’s server and from there to OpenAI. The key stays on the server.');
    else notices.push('Offline voice simulator: it reads the lab’s own sample clips only.');

    // 1. The audio, if any: bounded, and typed by its bytes.
    let audio: { bytes: Buffer; type: AudioType } | null = null;
    if (input.audioSource === 'upload') {
      const file = input.audio[0];
      if (!file)
        throw new LabError('VALIDATION_FAILED', 'Choose or record an audio file, or set the audio source to none', {
          details: [{ path: 'input.audio', message: 'Required for an upload' }],
        });
      const bytes = Buffer.from(file.dataBase64, 'base64');
      if (bytes.length > MAX_AUDIO_BYTES)
        throw new LabError('VALIDATION_FAILED', `Audio is larger than ${MAX_AUDIO_BYTES / 1_000_000} MB`, {
          details: [{ path: 'input.audio', message: 'Too large' }],
        });
      const type = sniffAudio(bytes);
      if (!type)
        throw new LabError('VALIDATION_FAILED', 'That file is not WAV, MP3, WebM or M4A audio', {
          details: [{ path: 'input.audio', message: 'Unsupported audio' }],
        });
      audio = { bytes, type };
    } else if (input.audioSource === 'sample') {
      // The sample clip is produced by the same voice (a true round trip); without a voice there is no clip.
      if (port) {
        ctx.emit({ type: 'workflow-step', stepId: 'make sample clip', status: 'running' });
        try {
          const clip = await (resolvedPort ?? port).speak(SAMPLES[input.sample], { signal: ctx.signal });
          audio = { bytes: clip.bytes, type: clip.mimeType === 'audio/wav' ? 'wav' : 'mp3' };
          ctx.emit({
            type: 'workflow-step',
            stepId: 'make sample clip',
            status: 'success',
            output: { bytes: clip.bytes.length },
          });
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          ctx.emit({ type: 'workflow-step', stepId: 'make sample clip', status: 'failed' });
        }
      }
    }

    // 2. Speech to text, with the typed text as the fallback.
    let stt: VoiceTurn['services']['stt'] = audio ? 'unavailable' : 'not-needed';
    let transcript: VoiceTurn['transcript'];
    let sttReason = audio && !port ? reason : undefined;
    if (audio && port) {
      ctx.emit({ type: 'workflow-step', stepId: 'speech to text', status: 'running' });
      try {
        const text = (await port.listen(audio.bytes, { filetype: audio.type, signal: ctx.signal })).trim();
        transcript = {
          text: text.slice(0, 4_000),
          provider,
          ...(wavSeconds(audio.bytes) !== undefined ? { audioSeconds: wavSeconds(audio.bytes) } : {}),
        };
        stt = 'used';
        ctx.emit({ type: 'workflow-step', stepId: 'speech to text', status: 'success', output: { transcript: transcript.text } });
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        stt = 'failed';
        sttReason = err instanceof Error ? err.message.slice(0, 300) : 'Speech-to-text failed';
        ctx.log('warn', `Speech-to-text failed: ${sttReason}`);
        ctx.emit({ type: 'workflow-step', stepId: 'speech to text', status: 'failed' });
      }
    }
    if (input.audioSource === 'sample' && !audio) {
      stt = 'unavailable';
      sttReason = reason ?? sttReason ?? 'The voice could not produce the sample clip.';
    }
    const typed = input.message || undefined;
    const usedText = transcript?.text || typed || null;
    const fallbackUsed = input.audioSource !== 'none' && !transcript;
    const fallbackReason = fallbackUsed
      ? typed
        ? `Answered your typed message: ${sttReason ?? 'no transcript'}`
        : `No transcript and nothing typed: ${sttReason ?? 'no transcript'}`
      : undefined;
    const identifiers = usedText ? confirmIdentifiers(usedText) : [];

    // 3. The answer (text first; audio is optional on top).
    let answer: string | null = null;
    let modelTokens: number | undefined;
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: deskScript() });
    if (usedText) {
      ctx.emit({ type: 'workflow-step', stepId: 'answer', status: 'running' });
      const agent = withLabLogger(
        ctx,
        // The voice instance is attached natively (agent.voice); the lab calls it through the bounded port.
        new Agent({
          id: 'voiceDesk',
          name: 'Voice desk',
          instructions: INSTRUCTIONS,
          model: resolved.model as never,
          ...(port ? { voice: port.voice as never } : {}),
        }),
      );
      // Tell the model which id the transcript most likely means, so it answers about the right order.
      const hint = identifiers
        .filter((i) => !i.confirmed)
        .map((i) => `"${i.heard}" probably means ${i.normalized} (unconfirmed)`)
        .join('; ');
      const res = await agent.generate(
        hint
          ? `${usedText}

[Speech recognition note: ${hint}.]`
          : usedText,
        { abortSignal: ctx.signal },
      );
      answer = `${confirmationLine(identifiers)}${res.text.trim()}`.slice(0, 4_000);
      modelTokens = res.usage?.totalTokens ?? undefined;
      ctx.emit({ type: 'workflow-step', stepId: 'answer', status: 'success' });
    }

    // 4. Text to speech, optional; the text answer stands on its own.
    let tts: VoiceTurn['services']['tts'] = input.speakReply ? (port ? 'used' : 'unavailable') : 'not-requested';
    let reply: VoiceTurn['audio'];
    let ttsReason = input.speakReply && !port ? reason : undefined;
    const spoken = answer ? answer.slice(0, MAX_SPEECH_CHARS) : '';
    if (input.speakReply && port && answer) {
      ctx.emit({ type: 'workflow-step', stepId: 'text to speech', status: 'running' });
      try {
        const out = await port.speak(spoken, { speaker: input.speaker, signal: ctx.signal });
        reply = { mimeType: out.mimeType, base64: out.bytes.toString('base64'), bytes: out.bytes.length };
        ctx.emit({ type: 'workflow-step', stepId: 'text to speech', status: 'success', output: { bytes: out.bytes.length } });
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        tts = 'failed';
        ttsReason = err instanceof Error ? err.message.slice(0, 300) : 'Text-to-speech failed';
        ctx.log('warn', `Text-to-speech failed: ${ttsReason}`);
        ctx.emit({ type: 'workflow-step', stepId: 'text to speech', status: 'failed' });
      }
    } else if (input.speakReply && !answer) tts = 'unavailable';
    if (tts !== 'used' && input.speakReply)
      notices.push(`The reply is text only: ${ttsReason ?? 'there was no answer to speak'}.`);
    if (provider === 'openai' && (stt === 'used' || tts === 'used'))
      notices.push(
        `OpenAI bills speech by characters and transcription by audio length; this request sent ${tts === 'used' ? spoken.length : 0} characters to speech${transcript?.audioSeconds !== undefined ? ` and ${transcript.audioSeconds} s to transcription` : stt === 'used' ? ' and one clip to transcription (length not measured for this format)' : ''}. See your provider’s pricing.`,
      );

    const ttsFellBack = input.speakReply && tts !== 'used';
    const fbReason =
      fallbackReason ?? (ttsFellBack ? `text-only reply: ${ttsReason ?? 'there was no answer to speak'}` : undefined);
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated && provider === 'offline' },
    });
    return {
      simulated: resolved.simulated && provider === 'offline',
      voice: {
        source: audio ? 'audio' : typed ? 'text' : 'none',
        ...(transcript ? { transcript } : {}),
        ...(typed ? { typedText: typed } : {}),
        usedText,
        identifiers,
        services: {
          provider,
          stt,
          tts,
          ...((sttReason ?? ttsReason) ? { reason: (sttReason ?? ttsReason)!.slice(0, 300) } : {}),
        },
        fallback: { used: fallbackUsed || ttsFellBack, ...(fbReason ? { reason: fbReason.slice(0, 300) } : {}) },
        answer,
        needsText: usedText === null,
        ...(reply ? { audio: reply } : {}),
        usage: {
          speechCharacters: tts === 'used' ? spoken.length : 0,
          ...(transcript?.audioSeconds !== undefined ? { transcribedSeconds: transcript.audioSeconds } : {}),
          ...(modelTokens !== undefined ? { modelTokens } : {}),
        },
        notices,
      },
    };
  },

  validate(out, input, { events }) {
    const v = out.voice;
    const serialized = JSON.stringify({ out, events });
    const leaks = /sk-[A-Za-z0-9_-]{16,}|authorization|x-api-key|bearer\s/i.test(serialized);
    const unconfirmed = v.identifiers.filter((i) => !i.confirmed);
    return summarizeChecks([
      {
        id: 'input-resolved',
        label: 'The assistant answered what was said or typed, or honestly asked you to type',
        passed: v.needsText ? v.answer === null && !v.transcript : Boolean(v.answer) && v.usedText !== null,
        message: v.needsText
          ? 'no transcript and nothing typed: please type your question'
          : `answered ${v.transcript ? 'the transcript' : 'your typed message'}`,
      },
      {
        id: 'fallback-honest',
        label: 'When an audio service was unavailable or failed, the turn went on in text and said why',
        passed:
          (v.services.stt === 'used' || v.services.stt === 'not-needed' || (v.fallback.used && Boolean(v.fallback.reason))) &&
          (v.services.tts === 'used' || v.services.tts === 'not-requested' || (v.fallback.used && !v.audio)),
        message: `speech-to-text ${v.services.stt}, text-to-speech ${v.services.tts}${v.services.reason ? ` (${v.services.reason})` : ''}`,
      },
      {
        id: 'identifiers-confirmed',
        label: 'An order id that was not heard exactly is named and confirmed before it is used',
        passed: unconfirmed.length === 0 || (v.answer ?? '').toLowerCase().includes('confirm'),
        message: v.identifiers.length
          ? v.identifiers.map((i) => `${i.heard} → ${i.normalized}${i.confirmed ? '' : ' (to confirm)'}`).join(', ')
          : 'no order ids',
      },
      {
        id: 'audio-bounded',
        label: 'Audio in and out stayed within the limits',
        passed:
          v.usage.speechCharacters <= MAX_SPEECH_CHARS &&
          (v.audio?.bytes ?? 0) <= 1_500_000 &&
          (input.audio[0]?.size ?? 0) <= MAX_AUDIO_BYTES * 1.5,
        message: `${v.usage.speechCharacters} characters spoken, ${v.audio?.bytes ?? 0} bytes of reply audio`,
      },
      {
        id: 'credentials-server-side',
        label: 'No key or authorization reached the output or the events; the provider was called by the server',
        passed: !leaks,
        message: `voice provider ${v.services.provider}, called from the server only`,
      },
      {
        id: 'reply-delivered',
        label: 'The reply arrived as audio when requested and available, otherwise as text with a reason',
        passed: v.needsText || (v.services.tts === 'used' ? Boolean(v.audio && v.audio.bytes > 0) : Boolean(v.answer)),
        message: v.audio ? `${v.audio.mimeType}, ${v.audio.bytes} bytes` : v.answer ? 'text reply' : 'no reply yet',
      },
    ]);
  },
};
