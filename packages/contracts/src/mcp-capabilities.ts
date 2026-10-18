import { z } from 'zod';

/**
 * An MCP capability probe: for each feature, what the protocol defines, what the server advertised,
 * what the Mastra adapter exposes and what was observed. Labs put it at `output.mcpCapabilities`;
 * the web Run tab renders it as a table (text only).
 */
export const McpCapabilityRowSchema = z.object({
  feature: z.string().min(1).max(80),
  /** How the protocol layer (MCP SDK client) offers it, e.g. "resources/list, resources/read". */
  protocol: z.string().max(300),
  server: z.enum(['advertised', 'not-advertised', 'n/a']),
  mastra: z.enum(['supported', 'limited', 'not-exposed']),
  observed: z.string().max(500),
  note: z.string().max(500),
});
export type McpCapabilityRow = z.infer<typeof McpCapabilityRowSchema>;

export const McpOperationSchema = z.object({
  kind: z.enum(['read-resource', 'get-prompt']),
  target: z.string().max(300),
  status: z.enum(['server', 'fallback', 'error']),
  /** Where the content came from, e.g. "resources.read" or "tool lab_title" or "local template". */
  via: z.string().max(200),
  content: z.string().max(20_000),
  fallbackReason: z.string().max(500).nullable(),
  error: z.object({ code: z.string().max(64), message: z.string().max(500) }).nullable(),
});
export type McpOperation = z.infer<typeof McpOperationSchema>;

export const McpCapabilitiesSchema = z.object({
  server: z.object({ name: z.string().max(200), version: z.string().max(64), protocolVersion: z.string().max(32).nullable() }),
  /** The capabilities object the server advertised, as received. */
  advertised: z.record(z.string(), z.unknown()),
  rows: z.array(McpCapabilityRowSchema).min(1).max(20),
  operation: McpOperationSchema.nullable(),
});
export type McpCapabilities = z.infer<typeof McpCapabilitiesSchema>;
