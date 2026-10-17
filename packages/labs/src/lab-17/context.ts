import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { isReservedRequestContextKey, RequestContext } from '@mastra/core/request-context';
import { LabError } from '@mlp/lab-engine';

export const LOCALES = ['en-US', 'es-ES', 'fr-FR', 'de-DE'] as const;
export type Locale = (typeof LOCALES)[number];

/** Verified identity, as the API's auth layer would produce from a validated session or JWT. */
export const ClaimsSchema = z.object({
  tenantId: z.string().regex(/^[a-z][a-z0-9-]{2,31}$/, 'tenantId must be a lowercase slug'),
  userId: z.string().regex(/^u-\d{4}$/, 'userId must look like u-1234'),
  plan: z.enum(['free', 'pro', 'enterprise']),
});

/** The only context the agent and its tools may receive. Strict: any other key is an error. */
export const TrustedContextSchema = ClaimsSchema.extend({
  locale: z.enum(LOCALES),
  requestId: z.string().regex(/^req-[a-z0-9]{4,12}$/),
}).strict();
export type TrustedContext = z.infer<typeof TrustedContextSchema>;
export const ALLOWED_KEYS = Object.keys(TrustedContextSchema.shape) as (keyof TrustedContext)[];

/** Untrusted client headers that may contribute a value, and which context key they map to. */
const HEADER_MAP: Record<string, 'locale' | 'requestId'> = { 'x-locale': 'locale', 'x-request-id': 'requestId' };
/** Headers that try to set an identity value: never allowed to override verified claims. */
const CLAIM_HEADERS = new Set(['x-tenant-id', 'x-user-id', 'x-plan']);
const DEFAULTS = { locale: 'en-US', requestId: 'req-0000' } as const;

export interface RejectedKey {
  source: 'claims' | 'headers';
  key: string;
  reason: 'reserved Mastra key' | 'cannot override a verified claim' | 'not on the allowlist' | 'invalid value';
}

export interface BuiltContext {
  context: TrustedContext;
  requestContext: RequestContext<TrustedContext>;
  rejected: RejectedKey[];
  defaulted: (keyof typeof DEFAULTS)[];
}

/**
 * Builds the request context on the server: verified claims first, then the allowlisted headers.
 * Everything else is dropped and reported. Invalid claims fail closed (VALIDATION_FAILED).
 */
export function buildRequestContext(claims: Record<string, unknown>, headers: Record<string, unknown>): BuiltContext {
  const rejected: RejectedKey[] = [];
  const classify = (source: RejectedKey['source'], key: string): RejectedKey['reason'] | null => {
    if (isReservedRequestContextKey(key)) return 'reserved Mastra key';
    if (source === 'headers' && CLAIM_HEADERS.has(key.toLowerCase())) return 'cannot override a verified claim';
    if (source === 'claims' && !(key in ClaimsSchema.shape)) return 'not on the allowlist';
    if (source === 'headers' && !(key.toLowerCase() in HEADER_MAP)) return 'not on the allowlist';
    return null;
  };

  const claimValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(claims)) {
    const reason = classify('claims', key);
    if (reason) rejected.push({ source: 'claims', key, reason });
    else claimValues[key] = value;
  }
  const verified = ClaimsSchema.safeParse(claimValues);
  if (!verified.success) {
    throw new LabError('VALIDATION_FAILED', 'Verified claims are invalid; the request is refused.', {
      details: verified.error.issues.map((i) => ({ path: `authClaims.${i.path.join('.')}`, message: i.message })),
    });
  }

  const fromHeaders: Partial<Pick<TrustedContext, 'locale' | 'requestId'>> = {};
  for (const [key, value] of Object.entries(headers)) {
    const reason = classify('headers', key);
    if (reason) {
      rejected.push({ source: 'headers', key, reason });
      continue;
    }
    const target = HEADER_MAP[key.toLowerCase()]!;
    const field = TrustedContextSchema.shape[target].safeParse(value);
    if (field.success) Object.assign(fromHeaders, { [target]: field.data });
    else rejected.push({ source: 'headers', key, reason: 'invalid value' });
  }

  const defaulted = (Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).filter((k) => fromHeaders[k] === undefined);
  const context = TrustedContextSchema.parse({ ...DEFAULTS, ...fromHeaders, ...verified.data });
  const requestContext = new RequestContext<TrustedContext>(Object.entries(context) as never);
  return { context, requestContext, rejected, defaulted };
}

/** Mock billing data for two tenants. */
export const INVOICES: Record<string, { id: string; status: 'open' | 'paid'; amountCents: number }[]> = {
  acme: [
    { id: 'INV-A-001', status: 'open', amountCents: 12_000 },
    { id: 'INV-A-002', status: 'paid', amountCents: 4_500 },
    { id: 'INV-A-003', status: 'open', amountCents: 2_990 },
  ],
  globex: [
    { id: 'INV-G-101', status: 'open', amountCents: 990_000 },
    { id: 'INV-G-102', status: 'open', amountCents: 125_000 },
  ],
};

export interface ToolObservation {
  /** Input after Mastra validated it against the tool's inputSchema. */
  input: unknown;
  contextKeys: string[];
  tenantUsed: string;
}

/** The tenant comes from the request context only; the model cannot choose it. */
export function createInvoiceTool(observations: ToolObservation[]) {
  return createTool({
    id: 'list-invoices',
    description: 'Lists the current customer’s invoices, filtered by status. The tenant is taken from the signed-in session.',
    inputSchema: z.object({ status: z.enum(['open', 'paid', 'all']) }),
    // The tool declares the context it needs; Mastra rejects the call before execute() if it is missing.
    requestContextSchema: TrustedContextSchema.pick({ tenantId: true, userId: true }).passthrough(),
    outputSchema: z.object({
      tenantId: z.string(),
      invoices: z.array(z.object({ id: z.string(), status: z.enum(['open', 'paid']), amountCents: z.number().int() })),
    }),
    execute: async (input, context) => {
      const rc = context?.requestContext as unknown as RequestContext<TrustedContext> | undefined;
      const tenantId = rc?.get('tenantId');
      if (!tenantId) throw new Error('No tenant in request context');
      observations.push({ input, contextKeys: [...(rc?.keys() ?? [])].map(String), tenantUsed: tenantId });
      const invoices = (INVOICES[tenantId] ?? []).filter((i) => input.status === 'all' || i.status === input.status);
      return { tenantId, invoices };
    },
  });
}
