import { z } from 'zod';
import type { Memory } from '@mastra/memory';

export const SEATS = ['window', 'aisle'] as const;
export const DIETS = ['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher'] as const;
export const CURRENCIES = ['EUR', 'USD', 'GBP'] as const;

/** The user's profile, as stored in Mastra working memory. Strict: unknown keys are rejected. */
export const PreferencesSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    homeAirport: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter IATA code such as LIS')
      .optional()
      .describe('3-letter IATA airport code'),
    seat: z.enum(SEATS).optional(),
    dietary: z
      .array(z.enum(DIETS))
      .max(3)
      .refine((d) => new Set(d).size === d.length, 'Each dietary need only once')
      .optional(),
    currency: z.enum(CURRENCIES).optional(),
  })
  .strict();
export type Preferences = z.infer<typeof PreferencesSchema>;

/** A settings-page patch: any subset of the fields, same rules, still strict. */
export const PreferencesPatchSchema = PreferencesSchema.partial().strict();

export type UpdateResult =
  { ok: true; applied: Record<string, unknown>; profile: unknown } | { ok: false; errors: { path: string; message: string }[] };

export interface ProfileIds {
  threadId: string;
  resourceId: string;
}

/** Reads working memory and parses it (an empty or non-JSON record becomes {}). */
export async function readProfile(memory: Memory, ids: ProfileIds): Promise<unknown> {
  const raw = await memory.getWorkingMemory(ids);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { _unparseable: raw };
  }
}

const issues = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));

/**
 * The only direct writer of working memory (for example, a settings page). Mastra's
 * memory.updateWorkingMemory() stores any string and replaces the record, so this validates the patch,
 * merges it with the current profile and validates the result before writing.
 */
export async function updateProfile(
  memory: Memory,
  ids: ProfileIds,
  patch: unknown,
  opts: { validate: boolean },
): Promise<UpdateResult> {
  if (!opts.validate) {
    // Anti-pattern for contrast: what a raw write does (no validation, the record is replaced).
    await memory.updateWorkingMemory({ ...ids, workingMemory: JSON.stringify(patch) });
    return { ok: true, applied: patch as Record<string, unknown>, profile: patch };
  }
  const parsedPatch = PreferencesPatchSchema.safeParse(patch);
  if (!parsedPatch.success) return { ok: false, errors: issues(parsedPatch.error) };
  const current = PreferencesSchema.safeParse(await readProfile(memory, ids));
  const merged = PreferencesSchema.safeParse({ ...(current.success ? current.data : {}), ...parsedPatch.data });
  if (!merged.success) return { ok: false, errors: issues(merged.error) };
  await memory.updateWorkingMemory({ ...ids, workingMemory: JSON.stringify(merged.data) });
  return { ok: true, applied: parsedPatch.data, profile: merged.data };
}
