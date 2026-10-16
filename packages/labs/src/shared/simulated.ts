/**
 * Deterministic "simulated model" answers for offline mode.
 *
 * They are NOT imitations of real models: they are clearly labelled and react to a few explicit
 * instruction cues so learners can see that instructions and model choice change the output,
 * while tests stay stable.
 */

export interface InstructionCues {
  formal: boolean;
  friendly: boolean;
  pirate: boolean;
  concise: boolean;
  bullets: boolean;
  spanish: boolean;
}

export function readCues(instructions: string): InstructionCues {
  return {
    formal: /\bformal\b|\bprofessional\b/i.test(instructions),
    friendly: /\bfriendly\b|\bwarm\b|\bcheerful\b/i.test(instructions),
    pirate: /\bpirate\b/i.test(instructions),
    concise: /\bconcise\b|\bbrief\b|\bshort\b|one sentence|two sentences|fewer/i.test(instructions),
    bullets: /\bbullet/i.test(instructions),
    spanish: /\bspanish\b|\bespañol\b/i.test(instructions),
  };
}

export type SimStyle = 'sentence' | 'bullets' | 'numbered';

/** Default style per provider so different model ids visibly differ offline. */
export function styleForModel(modelId: string): SimStyle {
  const provider = modelId.split('/')[0];
  return provider === 'anthropic' ? 'bullets' : provider === 'google' ? 'numbered' : 'sentence';
}

export function simulatedAnswer(opts: { modelId: string; system: string; user: string; label?: boolean }): string {
  const cues = readCues(opts.system);
  const topic = opts.user.trim().replace(/[?.!]+$/, '');
  const greeting = cues.pirate ? 'Arr, matey!' : cues.formal ? 'Good day.' : cues.friendly ? 'Happy to help!' : '';
  const points = cues.spanish
    ? [
        `Sobre "${topic}": aquí tienes una respuesta simulada.`,
        'Revisa los detalles en la documentación oficial.',
        'Pregunta de nuevo si necesitas más ayuda.',
      ]
    : [
        `About "${topic}": here is a simulated answer.`,
        'Check the details in the official documentation.',
        'Ask again if you need more help.',
      ];
  const used = cues.concise ? points.slice(0, 1) : points;
  const style: SimStyle = cues.bullets ? 'bullets' : styleForModel(opts.modelId);
  const body =
    style === 'bullets'
      ? used.map((p) => `- ${p}`).join('\n')
      : style === 'numbered'
        ? used.map((p, i) => `${i + 1}. ${p}`).join('\n')
        : used.join(' ');
  const head = opts.label === false ? '' : `[simulated ${opts.modelId}] `;
  return `${head}${greeting ? `${greeting}${style === 'sentence' ? ' ' : '\n'}` : ''}${body}`;
}
