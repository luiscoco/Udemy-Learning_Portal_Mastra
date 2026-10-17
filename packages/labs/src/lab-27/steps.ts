import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

export const CITIES = {
  Lisbon: { timeZone: 'Europe/Lisbon' },
  Berlin: { timeZone: 'Europe/Berlin' },
  'New York': { timeZone: 'America/New_York' },
  Tokyo: { timeZone: 'Asia/Tokyo' },
} as const;
export type City = keyof typeof CITIES;
const CITY_NAMES = Object.keys(CITIES) as [City, ...City[]];

/** Mock venue directory (city → room → address). */
export const VENUES: Record<string, string> = {
  'Lisbon/Atlas': 'Rua Augusta 100, 1100-053 Lisboa',
  'Berlin/Spree': 'Friedrichstraße 50, 10117 Berlin',
  'New York/Hudson': '350 W 34th St, New York, NY 10001',
  'Tokyo/Sakura': '1-1 Marunouchi, Chiyoda, Tokyo',
};

// ---- The typed contract of every transition ----
export const InviteInputSchema = z.object({
  invitation: z.string().trim().min(10).max(1_000),
  today: z.iso.date(),
});
export const ParsedSchema = z.object({
  title: z.string().min(1),
  date: z.iso.date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  city: z.enum(CITY_NAMES),
  room: z.string().nullable(),
  organiser: z.string().nullable(),
});
export const EnrichedSchema = ParsedSchema.extend({
  weekday: z.string(),
  daysUntil: z.number().int(),
  timeZone: z.string(),
  startUtc: z.iso.datetime(),
  address: z.string().nullable(),
});
export const RenderInputSchema = z.object({
  title: z.string(),
  when: z.string(),
  startUtc: z.iso.datetime(),
  where: z.string(),
  organiser: z.string().nullable(),
  daysUntil: z.number().int(),
});
export const RenderedSchema = z.object({ headline: z.string(), markdown: z.string(), ics: z.string() });
export type Parsed = z.infer<typeof ParsedSchema>;
export type Enriched = z.infer<typeof EnrichedSchema>;
export type RenderInput = z.infer<typeof RenderInputSchema>;
export type Rendered = z.infer<typeof RenderedSchema>;

/** Offset of an IANA zone at a UTC instant, in minutes (via Intl, no date library). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Local wall-clock time in a zone → UTC ISO string (two passes handle DST edges). */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let utc = wall - offsetMinutes(wall, timeZone) * 60_000;
  utc = wall - offsetMinutes(utc, timeZone) * 60_000;
  return new Date(utc).toISOString();
}

/** "YYYY-MM-DD" → UTC midnight in ms. */
const utcDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

export function enrich(p: Parsed, today: string): Enriched {
  const tz = CITIES[p.city].timeZone;
  const day = utcDay(p.date);
  const ref = utcDay(today);
  return {
    ...p,
    weekday: new Date(day).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    daysUntil: Math.round((day - ref) / 86_400_000),
    timeZone: tz,
    startUtc: zonedToUtc(p.date, p.time, tz),
    address: p.room ? (VENUES[`${p.city}/${p.room}`] ?? null) : null,
  };
}

const icsStamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

export function render(r: RenderInput): Rendered {
  const headline = `${r.title} — ${r.when}`;
  const markdown = [
    `### ${r.title}`,
    `- **When:** ${r.when} (in ${r.daysUntil} day${r.daysUntil === 1 ? '' : 's'})`,
    `- **Where:** ${r.where}`,
    r.organiser ? `- **Organiser:** ${r.organiser}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mastra-learning-platform//lab-27//EN',
    'BEGIN:VEVENT',
    `DTSTART:${icsStamp(r.startUtc)}`,
    `SUMMARY:${icsText(r.title)}`,
    `LOCATION:${icsText(r.where)}`,
    ...(r.organiser ? [`ORGANIZER;CN=${icsText(r.organiser)}:mailto:noreply@example.com`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return { headline, markdown, ics };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

/** parse → enrich → map → render, each boundary typed by the schemas above. */
export function buildInviteWorkflow(agent: AnyAgent, opts: { brokenEnrich: boolean; signal?: AbortSignal }) {
  const parse = createStep({
    id: 'parse',
    description: 'Extracts the event fields from the invitation text.',
    inputSchema: InviteInputSchema,
    outputSchema: ParsedSchema,
    execute: async ({ inputData }) => {
      const res = await agent.generate(inputData.invitation, {
        structuredOutput: { schema: ParsedSchema },
        abortSignal: opts.signal,
      });
      return ParsedSchema.parse(res.object);
    },
  });
  const enrichStep = createStep({
    id: 'enrich',
    description: 'Adds weekday, countdown, time zone, UTC start and venue address.',
    inputSchema: ParsedSchema,
    outputSchema: EnrichedSchema,
    execute: async ({ inputData, getInitData }) => {
      const enriched = enrich(inputData, (getInitData() as z.infer<typeof InviteInputSchema>).today);
      // Simulated bug: daysUntil becomes text. The mapping step has no schema and passes it on; the next
      // schema'd step (render) rejects it at its input boundary.
      return opts.brokenEnrich ? ({ ...enriched, daysUntil: `${enriched.daysUntil} days` } as unknown as Enriched) : enriched;
    },
  });
  const renderStep = createStep({
    id: 'render',
    description: 'Renders a Markdown card and an .ics calendar entry.',
    inputSchema: RenderInputSchema,
    outputSchema: RenderedSchema,
    execute: async ({ inputData }) => render(inputData),
  });
  return createWorkflow({ id: 'invite-workflow', inputSchema: InviteInputSchema, outputSchema: RenderedSchema })
    .then(parse)
    .then(enrichStep)
    .map(async ({ inputData }) => {
      const e = inputData as Enriched;
      return {
        title: e.title,
        when: `${e.weekday} ${e.date}, ${e.time} ${e.timeZone} (${e.startUtc.slice(11, 16)} UTC)`,
        startUtc: e.startUtc,
        where: [e.room, e.address ?? e.city].filter(Boolean).join(', '),
        organiser: e.organiser,
        daysUntil: e.daysUntil,
      } satisfies RenderInput;
    })
    .then(renderStep)
    .commit();
}
