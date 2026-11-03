import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab69Definition = {
  id: 'lab-69',
  number: 69,
  title: 'Voice assistant',
  moduleId: 'module-14',
  summary:
    'Add optional speech-to-text and text-to-speech to an assistant with Mastra’s voice providers, keep typed input as the reliable path, and fall back to text whenever an audio service is missing or fails.',
  concept:
    'Voice is an extra way in and out, not a replacement for text: some learners cannot use a microphone, some browsers cannot record, and audio services fail or cost money. ' +
    'Mastra models this with voice providers that implement speak() and listen(); here the live provider is Mastra’s official OpenAIVoice (whisper-1 to transcribe, tts-1 to speak), and the offline provider is a small simulator built on the same MastraVoice base class. ' +
    'The browser only records or uploads audio and plays back the reply; every call to a voice provider happens on the server, where the key lives. ' +
    'Before the browser asks for the microphone, the page says where the audio goes and that a provider may bill for it, and the run reports what was billed: characters sent to speech and seconds sent to transcription. ' +
    'When transcription is unavailable or fails, the assistant answers your typed message instead; with nothing typed, it asks you to type rather than guessing what you said. ' +
    'Transcripts are imperfect: a real run heard “ORD-5001” as “Ority 5001”, so identifiers taken from speech are normalized and confirmed before anything acts on them. ' +
    'When speech output fails, the answer still arrives as text. ' +
    'Offline, the simulator only understands the clips it made itself and says so for anything else, which makes the fallback easy to try.',
  objectives: [
    'Integrate optional speech-to-text and text-to-speech through Mastra voice providers',
    'Keep typed input working and fall back to text when audio is unavailable or fails',
    'Keep audio credentials on the server and show permission and price notices',
    'Confirm identifiers that came from speech before using them',
  ],
  prerequisites: ['lab-68'],
  inputs: [
    {
      kind: 'textarea',
      name: 'message',
      label: 'Typed message (always works)',
      maxLength: 1_000,
      rows: 2,
      default: '',
      required: false,
      help: 'Used when there is no audio, or when the audio cannot be transcribed.',
    },
    {
      kind: 'select',
      name: 'audioSource',
      label: 'Audio',
      default: 'sample',
      options: [
        { value: 'none', label: 'No audio' },
        { value: 'sample', label: 'A sample phrase' },
        { value: 'upload', label: 'Upload or record' },
      ],
    },
    {
      kind: 'select',
      name: 'sample',
      label: 'Sample phrase',
      default: 'status',
      visibleWhen: { field: 'audioSource', in: ['sample'] },
      options: [
        { value: 'status', label: '“Where is my order ORD-5001?”' },
        { value: 'misheard', label: '“…when Ority 5002 will arrive?” (a misheard id)' },
        { value: 'general', label: '“What can you help me with?”' },
      ],
    },
    {
      kind: 'file',
      name: 'audio',
      label: 'Audio file or recording',
      accept: ['.wav', '.mp3', '.webm', '.m4a'],
      maxBytes: 1_000_000,
      maxFiles: 1,
      record: true,
      required: false,
      visibleWhen: { field: 'audioSource', in: ['upload'] },
      help: 'Up to 1 MB. Offline, the simulator cannot transcribe real recordings: use live mode with OpenAI, or type.',
    },
    { kind: 'boolean', name: 'speakReply', label: 'Speak the reply', default: true },
    {
      kind: 'select',
      name: 'voice',
      label: 'Voice provider',
      default: 'offline',
      options: [
        { value: 'offline', label: 'Offline simulator (free)' },
        { value: 'openai', label: 'OpenAI (live mode, billed by OpenAI)' },
      ],
    },
    {
      kind: 'select',
      name: 'speaker',
      label: 'Speaker (OpenAI)',
      default: 'alloy',
      visibleWhen: { field: 'voice', in: ['openai'] },
      options: ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'].map((v) => ({ value: v, label: v })),
    },
    {
      kind: 'select',
      name: 'fault',
      label: 'Fault',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'stt-down', label: 'Speech-to-text is down' },
        { value: 'tts-down', label: 'Text-to-speech is down' },
      ],
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
    },
  ],
  exampleInput: {
    message: '',
    audioSource: 'sample',
    sample: 'status',
    audio: [],
    speakReply: true,
    voice: 'offline',
    speaker: 'alloy',
    fault: 'none',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The simulator makes the sample clip and reads it back as “Where is my order ORD-5001?”. The assistant answers that ORD-5001 is shipped, and the answer is spoken back as a short WAV you can play. No fallback is needed.',
    example: {
      voice: {
        source: 'audio',
        usedText: 'Where is my order ORD-5001?',
        services: { provider: 'offline', stt: 'used', tts: 'used' },
        fallback: { used: false },
        needsText: false,
      },
      simulated: true,
    },
  },
  guide: {
    procedure: [
      'Run the example: read the transcript, the answer, and play the spoken reply.',
      'Choose the misheard sample: the assistant names ORD-5002 and asks you to confirm it.',
      'Set Fault to “Speech-to-text is down” with nothing typed: the assistant asks you to type. Type a question and run again.',
      'Set Fault to “Text-to-speech is down”: the answer still arrives, as text, with the reason.',
      'Choose “Upload or record”, read the microphone notice, and record a question. Offline the simulator refuses it honestly; in live mode with OpenAI it is transcribed.',
      'In live mode with OpenAI, read the usage notice: characters spoken and seconds transcribed.',
    ],
    prediction: 'If speech-to-text is down and the learner typed nothing, what should the assistant do?',
    hints: [
      { level: 1, text: 'Every audio step can fail; decide what the text path does in each case.' },
      { level: 2, text: 'Resolve the voice on the server, try speech-to-text, and only then pick the text to answer.' },
      {
        level: 3,
        text: 'usedText = transcript ?? typed message ?? null; when null, ask to type. Speak the reply only if text-to-speech is available, and keep the text answer either way.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Calling the speech API from the browser with a key in the bundle.',
        fix: 'Send audio to your server; only the server holds the provider key.',
      },
      { mistake: 'Making voice the only way to ask.', fix: 'Keep typed input on screen and use it as the fallback.' },
      { mistake: 'Acting on an id taken straight from a transcript.', fix: 'Normalize it and confirm it with the user first.' },
      {
        mistake: 'Asking for the microphone without saying why or where the audio goes.',
        fix: 'Show a notice first; record only after an explicit click.',
      },
    ],
    challenge: {
      prompt:
        'Add a third voice provider through Mastra’s CompositeVoice: OpenAI for listening and the offline simulator for speaking, and show which direction used which provider.',
      successCriteria: [
        'Each direction reports its provider',
        'The fallback still works when either side fails',
        'No key reaches the browser',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where should the call to the speech-to-text provider happen?',
      choices: ['In the browser', 'On the server, which holds the key', 'In a browser extension', 'In local storage'],
      correctIndex: 1,
      explanation: 'The browser only records and plays audio; credentials stay on the server.',
    },
    {
      id: 'q2',
      prompt: 'Transcription is down and nothing was typed. What should happen?',
      choices: ['Guess the question', 'Return an error page', 'Ask the user to type the question', 'Retry forever'],
      correctIndex: 2,
      explanation: 'Never invent a transcript; the text path is the fallback.',
    },
    {
      id: 'q3',
      prompt: 'Why confirm “Ority 5002” as ORD-5002 before acting?',
      choices: ['It is faster', 'Speech recognition mishears identifiers', 'Mastra requires it', 'To save tokens'],
      correctIndex: 1,
      explanation: 'A real run heard ORD-5001 as “Ority 5001”.',
    },
    {
      id: 'q4',
      prompt: 'What should a price notice for voice say when you do not know the exact price?',
      choices: [
        'An invented price',
        'Nothing',
        'What is billed (characters, audio length) and how much of it this request used',
        'That it is free',
      ],
      correctIndex: 2,
      explanation: 'Report real usage and point to the provider’s pricing instead of guessing a number.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Voice turn with text fallback', description: 'Transcribe, answer, speak, and fall back.' },
    { path: 'voice.ts', title: 'Voice providers', description: 'OpenAIVoice and the offline MastraVoice simulator.' },
    { path: 'identifiers.ts', title: 'Confirming ids from speech', description: 'Normalize misheard order ids.' },
  ],
  exercise: {
    instructions: 'Explain the fallback for each failure, then implement the CompositeVoice challenge.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'input-resolved', label: 'The assistant answered what was said or typed, or honestly asked you to type' },
    { id: 'fallback-honest', label: 'When an audio service was unavailable or failed, the turn went on in text and said why' },
    { id: 'identifiers-confirmed', label: 'An order id that was not heard exactly is named and confirmed before it is used' },
    { id: 'audio-bounded', label: 'Audio in and out stayed within the limits' },
    {
      id: 'credentials-server-side',
      label: 'No key or authorization reached the output or the events; the provider was called by the server',
    },
    { id: 'reply-delivered', label: 'The reply arrived as audio when requested and available, otherwise as text with a reason' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Voice is optional', minutes: 1, talkingPoints: ['Text stays the reliable path', 'Who cannot use voice'] },
      { title: 'Mastra voice providers', minutes: 1, talkingPoints: ['speak() and listen()', 'OpenAIVoice and a simulator'] },
      { title: 'Server-side audio', minutes: 1, talkingPoints: ['Permission notice', 'Keys never in the browser'] },
      { title: 'Fallbacks', minutes: 2, talkingPoints: ['STT down', 'TTS down', 'Nothing typed'] },
      { title: 'Imperfect transcripts', minutes: 1, talkingPoints: ['“Ority 5001”', 'Confirm before acting'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice:
      'Offline is free (a simulator). In live mode with the OpenAI voice, OpenAI bills speech by characters and transcription by audio length, plus one short model call; the run reports how much it used. Faults are injected before any provider call.',
  },
  tags: ['voice', 'speech', 'accessibility', 'fallback', 'security'],
} satisfies LabDefinitionInput;
