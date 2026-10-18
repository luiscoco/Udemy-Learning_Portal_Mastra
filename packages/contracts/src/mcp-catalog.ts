import { z } from 'zod';

/**
 * Tools discovered from an MCP server, with their JSON Schemas, the client's permission decision and
 * an optional call. Labs put it at `output.mcpCatalog`; the web Run tab renders it as text.
 */
export const McpToolAnnotationsSchema = z.object({
  title: z.string().max(200).optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});

export const MCP_REJECTION_REASONS = [
  'unknown-tool',
  'not-allowlisted',
  'not-read-only',
  'invalid-arguments',
  'tool-error',
] as const;
export type McpRejectionReason = (typeof MCP_REJECTION_REASONS)[number];

const JsonSchemaObject = z.record(z.string(), z.unknown());

export const McpToolSchema = z.object({
  /** Namespaced key used by Mastra (`server_tool`). */
  key: z.string().min(1).max(200),
  name: z.string().min(1).max(128),
  title: z.string().max(200).nullable(),
  description: z.string().max(2_000),
  annotations: McpToolAnnotationsSchema.nullable(),
  inputSchema: JsonSchemaObject,
  outputSchema: JsonSchemaObject.nullable(),
  permission: z.object({ allowed: z.boolean(), reason: z.string().max(300) }),
});
export type McpTool = z.infer<typeof McpToolSchema>;

export const McpCallSchema = z.object({
  toolName: z.string().max(128),
  args: z.unknown(),
  status: z.enum(['success', 'rejected', 'error']),
  reason: z.enum(MCP_REJECTION_REASONS).nullable(),
  message: z.string().max(2_000),
  suggestions: z.array(z.string().max(128)).max(5),
  fieldErrors: z.array(z.object({ field: z.string().max(200), message: z.string().max(300) })).max(20),
  result: z.unknown(),
  durationMs: z.number().nonnegative(),
});
export type McpCall = z.infer<typeof McpCallSchema>;

export const McpCatalogSchema = z.object({
  server: z.object({
    key: z.string().max(64),
    name: z.string().max(200),
    version: z.string().max(64),
    protocolVersion: z.string().max(32).nullable(),
  }),
  tools: z.array(McpToolSchema).max(50),
  call: McpCallSchema.nullable(),
});
export type McpCatalog = z.infer<typeof McpCatalogSchema>;

/** One row of a tool's parameter table, derived from its JSON Schema (`properties` and `required`). */
export interface McpParameter {
  name: string;
  type: string;
  required: boolean;
  constraints: string[];
  description: string;
}

/** Derives the parameter table shown for a tool. Unknown schema shapes give an empty list. */
export function mcpParameters(inputSchema: Record<string, unknown>): McpParameter[] {
  const props = inputSchema.properties;
  if (!props || typeof props !== 'object') return [];
  const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required.map(String) : []);
  return Object.entries(props as Record<string, Record<string, unknown>>).map(([name, s]) => {
    const constraints: string[] = [];
    for (const key of ['minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'default'] as const)
      if (s && key in s) constraints.push(`${key} ${JSON.stringify(s[key])}`);
    const type = Array.isArray(s?.enum) ? `enum: ${s.enum.map((v) => JSON.stringify(v)).join(' | ')}` : String(s?.type ?? 'any');
    return {
      name,
      type,
      required: required.has(name),
      constraints,
      description: typeof s?.description === 'string' ? s.description : '',
    };
  });
}
