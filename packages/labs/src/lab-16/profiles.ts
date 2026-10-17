import { z } from 'zod';
import type { RequestContext } from '@mastra/core/request-context';

export const PERSONAS = {
  ava: { name: 'Ava', role: 'a warm customer-support specialist' },
  lucia: { name: 'Lucía', role: 'a precise logistics coordinator' },
  kenji: { name: 'Kenji', role: 'a calm hotel-style concierge' },
  max: { name: 'Max', role: 'an upbeat store guide' },
} as const;
export type PersonaId = keyof typeof PERSONAS;

export const TONES = {
  friendly: 'Warm and encouraging. Start with one short friendly greeting.',
  formal: 'Formal and courteous. Use the polite form of address. No exclamation marks.',
  concise: 'Concise. No greeting, at most two sentences before the sign-off.',
} as const;
export type Tone = keyof typeof TONES;

export const LOCALES = {
  'en-US': 'English (United States)',
  'es-ES': 'Spanish (Spain)',
  'fr-FR': 'French (France)',
  'de-DE': 'German (Germany)',
  'ja-JP': 'Japanese (Japan)',
} as const;
export type Locale = keyof typeof LOCALES;

const ids = <T extends object>(o: T) => Object.keys(o) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]];

/** One request's settings, as the learner edits them. Only enum values: no free text reaches the instructions. */
export const ProfileSchema = z.object({
  persona: z.enum(ids(PERSONAS)),
  tone: z.enum(ids(TONES)),
  locale: z.enum(ids(LOCALES)),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** What the agent accepts per call (Mastra validates it at the start of generate/stream). */
export const SupportContextSchema = ProfileSchema.extend({ requestId: z.string().regex(/^(req-\d{1,2}|probe)$/) });
export type SupportContext = z.infer<typeof SupportContextSchema>;

/** Fixed order facts; formatted per locale with Intl so every language gets correct dates and money. */
export const ORDER = { id: 'ORD-2042', deliveryDate: '2026-10-21', totalCents: 4590, currency: 'EUR' } as const;

export function formatFacts(locale: Locale) {
  return {
    deliveryDate: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${ORDER.deliveryDate}T00:00:00Z`),
    ),
    total: new Intl.NumberFormat(locale, { style: 'currency', currency: ORDER.currency }).format(ORDER.totalCents / 100),
  };
}

/** Builds the system instructions for one request. Pure: same settings → same text. */
export function buildInstructions(s: SupportContext): string {
  const persona = PERSONAS[s.persona];
  const facts = formatFacts(s.locale);
  return [
    `You are ${persona.name}, ${persona.role} for an online shop.`,
    `Request reference: ${s.requestId}`,
    `Tone: ${s.tone}. ${TONES[s.tone]}`,
    `Locale: ${s.locale}. Reply only in ${LOCALES[s.locale]}.`,
    `Order facts for ${ORDER.id}:`,
    `Delivery date: ${facts.deliveryDate}`,
    `Total: ${facts.total}`,
    'Copy the delivery date and the total exactly as written above. Do not invent other facts.',
    `Sign off with: — ${persona.name}`,
  ].join('\n');
}

/** Reads the settings from Mastra's RequestContext (the correct, request-scoped source). */
export function settingsFrom(requestContext: RequestContext<SupportContext>): SupportContext {
  return {
    persona: requestContext.get('persona'),
    tone: requestContext.get('tone'),
    locale: requestContext.get('locale'),
    requestId: requestContext.get('requestId'),
  };
}

/** Compares text the way a reader would: Intl uses (narrow) no-break spaces that models often replace. */
export const normalize = (s: string) =>
  s
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
