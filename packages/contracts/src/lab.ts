import { z } from 'zod';
import { CatalogModuleSchema, LabIdSchema, ModuleIdSchema } from './catalog.js';
import { RuntimeModeSchema } from './health.js';

/** A course module grouping labs (same shape as the catalog module). */
export const LabModuleSchema = CatalogModuleSchema;
export type LabModule = z.infer<typeof LabModuleSchema>;

// ---------- Inputs ----------

/**
 * Shows a field or select option only while an earlier field's current value (as a string) is one of
 * `in`. Hidden fields are not submitted; the server must still enforce the same rule.
 */
export const VisibleWhenSchema = z.object({
  field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  in: z.array(z.string()).min(1),
});
export type VisibleWhen = z.infer<typeof VisibleWhenSchema>;

const fieldBase = {
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field names are identifiers'),
  label: z.string().min(1),
  help: z.string().optional(),
  required: z.boolean().default(true),
  visibleWhen: VisibleWhenSchema.optional(),
};

export const InputFieldSchema = z.discriminatedUnion('kind', [
  z.object({
    ...fieldBase,
    kind: z.literal('text'),
    maxLength: z.number().int().positive().max(20_000),
    minLength: z.number().int().nonnegative().optional(),
    placeholder: z.string().optional(),
    default: z.string().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('textarea'),
    maxLength: z.number().int().positive().max(20_000),
    minLength: z.number().int().nonnegative().optional(),
    rows: z.number().int().min(2).max(30).optional(),
    placeholder: z.string().optional(),
    default: z.string().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('number'),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional(),
    default: z.number().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('select'),
    options: z.array(z.object({ value: z.string(), label: z.string(), visibleWhen: VisibleWhenSchema.optional() })).min(1),
    default: z.string().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('boolean'),
    default: z.boolean().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('json'),
    maxBytes: z.number().int().positive().max(64_000),
    default: z.unknown().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('file'),
    /** Allowed file extensions, lower-case with the dot (".pdf"). The server decides from the content too. */
    accept: z.array(z.string().regex(/^\.[a-z0-9]{1,10}$/)).min(1),
    /** Per-file size limit enforced by the server (the browser only warns). */
    maxBytes: z.number().int().positive().max(5_000_000),
    maxFiles: z.number().int().min(1).max(10),
    /** Offer an in-browser microphone recorder for this field (L69). */
    record: z.boolean().optional(),
  }),
]);
export type InputField = z.infer<typeof InputFieldSchema>;

// ---------- File uploads ----------

/** A file sent inside a run request (read by the browser, validated by the server). */
export const UploadedFileSchema = z.object({
  name: z.string().min(1).max(255),
  /** MIME type the browser declared. Untrusted: servers must sniff the content. */
  type: z.string().max(100),
  /** Size the browser declared. Untrusted: servers measure the decoded bytes. */
  size: z.number().int().nonnegative(),
  dataBase64: z.string(),
});
export type UploadedFile = z.infer<typeof UploadedFileSchema>;

/**
 * Files up to this factor above a field's maxBytes still reach the server, so it can reject them one by
 * one (FILE_TOO_LARGE) instead of refusing the whole request; anything larger is cut off with HTTP 413.
 */
export const FILE_TRANSPORT_FACTOR = 1.25;
export const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;
const transportCeiling = (maxBytes: number) => base64Length(Math.ceil(maxBytes * FILE_TRANSPORT_FACTOR));

/** Server-side schema for a file field's value: bounded count and bounded encoded size per file. */
export function uploadedFilesSchema(field: { maxBytes: number; maxFiles: number }) {
  return z.array(UploadedFileSchema.extend({ dataBase64: z.string().max(transportCeiling(field.maxBytes)) })).max(field.maxFiles);
}

export const DEFAULT_REQUEST_BYTES = 64 * 1024;

/** Largest run-request body a lab may receive: the default, plus room for its declared file fields. */
export function maxRequestBytes(def: { inputs: readonly InputField[] }): number {
  let bytes = DEFAULT_REQUEST_BYTES;
  for (const f of def.inputs) if (f.kind === 'file') bytes += f.maxFiles * (transportCeiling(f.maxBytes) + 1024);
  return bytes;
}

export const InputValuesSchema = z.record(z.string(), z.unknown());
export type InputValues = z.infer<typeof InputValuesSchema>;

// ---------- Lesson content ----------

export const HintSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1),
});
export type Hint = z.infer<typeof HintSchema>;

export const DiagramSchema = z.object({
  kind: z.enum(['mermaid', 'ascii']),
  source: z.string().min(1),
  caption: z.string().min(1),
});

export const LessonGuideSchema = z.object({
  procedure: z.array(z.string().min(1)).min(2),
  prediction: z.string().min(1),
  hints: z
    .array(HintSchema)
    .length(3, 'Exactly three progressive hints are required')
    .refine((h) => h.every((hint, i) => hint.level === i + 1), 'Hints must be ordered levels 1, 2, 3'),
  commonMistakes: z.array(z.object({ mistake: z.string().min(1), fix: z.string().min(1) })).min(1),
  challenge: z.object({ prompt: z.string().min(1), successCriteria: z.array(z.string().min(1)).min(1) }),
  diagram: DiagramSchema.optional(),
});
export type LessonGuide = z.infer<typeof LessonGuideSchema>;

export const QuizQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    choices: z.array(z.string().min(1)).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
    explanation: z.string().min(1),
  })
  .refine((q) => q.correctIndex < q.choices.length, {
    message: 'correctIndex must point at one of the choices',
    path: ['correctIndex'],
  });
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const InstructorOutlineSchema = z
  .object({
    durationMinutes: z.number().min(3).max(7),
    segments: z
      .array(
        z.object({
          title: z.string().min(1),
          minutes: z.number().positive(),
          talkingPoints: z.array(z.string().min(1)).min(1),
        }),
      )
      .min(2),
  })
  .refine((o) => Math.abs(o.segments.reduce((s, seg) => s + seg.minutes, 0) - o.durationMinutes) < 0.01, {
    message: 'Segment minutes must add up to durationMinutes',
    path: ['segments'],
  });
export type InstructorOutline = z.infer<typeof InstructorOutlineSchema>;

/** Relative path inside the lab's own folder. No traversal, no absolute paths. */
export const LabSourcePathSchema = z
  .string()
  .regex(/^[\w-]+(\/[\w-]+)*\.(ts|tsx|json|md)$/, 'Source paths are relative files inside the lab folder');

export const SourceFileRefSchema = z.object({
  path: LabSourcePathSchema,
  title: z.string().min(1),
  description: z.string().optional(),
});

export const ExerciseSchema = z.object({
  instructions: z.string().min(1),
  starterFile: LabSourcePathSchema.optional(),
  solutionFile: LabSourcePathSchema.optional(),
});

export const CheckDescriptorSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });

export const ExecutionLimitsSchema = z
  .object({
    modes: z.array(RuntimeModeSchema).min(1),
    defaultTimeoutMs: z.number().int().min(100),
    maxTimeoutMs: z.number().int().min(100).max(300_000),
    budget: z
      .object({
        maxSteps: z.number().int().positive().optional(),
        maxToolCalls: z.number().int().positive().optional(),
        maxTokens: z.number().int().positive().optional(),
        maxRetries: z.number().int().nonnegative().optional(),
      })
      .default({}),
    costNotice: z.string().min(1),
  })
  .refine((e) => e.defaultTimeoutMs <= e.maxTimeoutMs, {
    message: 'defaultTimeoutMs must not exceed maxTimeoutMs',
    path: ['defaultTimeoutMs'],
  });
export type ExecutionLimits = z.infer<typeof ExecutionLimitsSchema>;

export const LabDefinitionSchema = z
  .object({
    id: LabIdSchema,
    number: z.number().int().min(0).max(99),
    title: z.string().min(1),
    moduleId: ModuleIdSchema,
    summary: z.string().min(1),
    /** Plain-language explanation, 5–10 sentences (checked by the conformance suite). */
    concept: z.string().min(1),
    objectives: z.array(z.string().min(1)).min(3).max(5),
    prerequisites: z.array(LabIdSchema),
    inputs: z.array(InputFieldSchema).min(1),
    exampleInput: InputValuesSchema,
    expectedOutput: z.object({ description: z.string().min(1), example: z.unknown() }),
    guide: LessonGuideSchema,
    quiz: z.array(QuizQuestionSchema).min(3).max(5),
    sourceFiles: z.array(SourceFileRefSchema).min(1),
    exercise: ExerciseSchema,
    checks: z.array(CheckDescriptorSchema).min(1),
    instructorOutline: InstructorOutlineSchema,
    execution: ExecutionLimitsSchema,
    tags: z.array(z.string()).default([]),
    /** How the Run tab presents the lab: a form (default) or a chat panel (L67). */
    presentation: z.enum(['form', 'chat', 'workspace']).optional(),
  })
  .superRefine((def, ctx) => {
    // visibleWhen may only depend on a field declared earlier (so the form can evaluate it top-down).
    const seen = new Set<string>();
    def.inputs.forEach((f, i) => {
      const refs = [f.visibleWhen, ...(f.kind === 'select' ? f.options.map((o) => o.visibleWhen) : [])];
      for (const ref of refs) {
        if (ref && !seen.has(ref.field)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inputs', i, 'visibleWhen'],
            message: `visibleWhen on "${f.name}" references "${ref.field}", which is not an earlier input field`,
          });
        }
      }
      seen.add(f.name);
    });
  });
export type LabDefinition = z.infer<typeof LabDefinitionSchema>;
export type LabDefinitionInput = z.input<typeof LabDefinitionSchema>;

export const SourceFileSchema = z.object({
  path: LabSourcePathSchema,
  title: z.string(),
  description: z.string().optional(),
  language: z.enum(['typescript', 'tsx', 'json', 'markdown']),
  code: z.string(),
});
export type SourceFile = z.infer<typeof SourceFileSchema>;

export const LabSourceResponseSchema = z.object({
  labId: LabIdSchema,
  files: z.array(SourceFileSchema),
  /** Exact versions of key dependencies the source was tested against. */
  pinned: z.record(z.string(), z.string()),
});
export type LabSourceResponse = z.infer<typeof LabSourceResponseSchema>;
