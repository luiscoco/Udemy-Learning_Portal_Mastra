import { z } from 'zod';
import { createStep, createWorkflow } from '@mastra/core/workflows';

// ---------- The order (parent) ----------

export const OrderSchema = z.object({
  orderId: z.string().regex(/^O-\d{1,6}$/),
  customer: z.object({ name: z.string().trim().min(1).max(80), email: z.string().max(120), country: z.string().regex(/^[A-Z]{2}$/) }),
  shippingAddress: z.string().max(200),
  items: z.array(z.object({ sku: z.string().max(20), qty: z.number().int().min(1).max(100), unitPrice: z.number().min(0).max(10_000) })).min(1).max(10),
  notes: z.string().max(500),
  cardLast4: z.string().regex(/^\d{4}$/),
});
export type Order = z.infer<typeof OrderSchema>;

// ---------- The subworkflow boundary ----------

/** The only data verification needs. Line items, address and card digits stay in the order workflow. */
export const VerificationInputSchema = z.object({
  email: z.string(),
  country: z.string(),
  total: z.number(),
  notes: z.string(),
});
export type VerificationInput = z.infer<typeof VerificationInputSchema>;
export const VERIFICATION_INPUT_KEYS = Object.keys(VerificationInputSchema.shape).sort();

export const RiskSchema = z.object({ riskLevel: z.enum(['low', 'medium', 'high']), reasons: z.array(z.string()).max(5) });
export type Risk = z.infer<typeof RiskSchema>;

export const VerificationResultSchema = z.object({
  verified: z.boolean(),
  identityOk: z.boolean(),
  riskLevel: z.enum(['low', 'medium', 'high', 'not-screened']),
  reasons: z.array(z.string()),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const FulfilmentSchema = z.object({
  orderId: z.string(),
  decision: z.enum(['approved', 'held']),
  total: z.number(),
  reasons: z.array(z.string()),
});
export type Fulfilment = z.infer<typeof FulfilmentSchema>;

export const DISPOSABLE_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com'];

export function checkIdentityRules(email: string): { identityOk: boolean; reasons: string[] } {
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { identityOk: false, reasons: ['email address is not valid'] };
  const domain = email.split('@')[1]!.toLowerCase();
  if (DISPOSABLE_DOMAINS.includes(domain)) return { identityOk: false, reasons: [`disposable email domain (${domain})`] };
  return { identityOk: true, reasons: [] };
}

/** Pure decision: verified only with a valid identity and a risk level below high. */
export function decideVerification(identity: { identityOk: boolean; reasons: string[] }, risk: Risk | null): VerificationResult {
  if (!identity.identityOk || !risk) return { verified: false, identityOk: identity.identityOk, riskLevel: 'not-screened', reasons: identity.reasons };
  return { verified: risk.riskLevel !== 'high', identityOk: true, riskLevel: risk.riskLevel, reasons: risk.reasons };
}

export const orderTotal = (o: Order) => Math.round(o.items.reduce((n, i) => n + i.qty * i.unitPrice, 0) * 100) / 100;

export type BoundaryFault = 'none' | 'whole-order' | 'loose-schema' | 'bad-output';
export type RiskScreener = (input: VerificationInput) => Promise<Risk>;

export const SUBWORKFLOW_ID = 'verify-customer';

/** The reusable subworkflow. `loose-schema` and `bad-output` are the contrast faults. */
export function buildVerificationWorkflow(screen: RiskScreener, fault: BoundaryFault) {
  const inputSchema = fault === 'loose-schema' ? z.looseObject(VerificationInputSchema.shape) : VerificationInputSchema;
  const IdentitySchema = z.object({ input: inputSchema, identityOk: z.boolean(), reasons: z.array(z.string()) });
  const checkIdentity = createStep({
    id: 'checkIdentity',
    description: 'Deterministic identity rules: email format and disposable domains.',
    inputSchema,
    outputSchema: IdentitySchema,
    execute: async ({ inputData }) => ({ input: inputData, ...checkIdentityRules(inputData.email) }),
  });
  const screenRisk = createStep({
    id: 'screenRisk',
    description: 'Agent risk screening (skipped when the identity check failed).',
    inputSchema: IdentitySchema,
    outputSchema: z.object({ identity: z.object({ identityOk: z.boolean(), reasons: z.array(z.string()) }), risk: RiskSchema.nullable() }),
    execute: async ({ inputData }) => ({
      identity: { identityOk: inputData.identityOk, reasons: inputData.reasons },
      risk: inputData.identityOk ? await screen(VerificationInputSchema.parse(inputData.input)) : null,
    }),
  });
  const decide = createStep({
    id: 'decide',
    description: 'Pure decision from identity and risk.',
    inputSchema: screenRisk.outputSchema,
    outputSchema: VerificationResultSchema,
    execute: async ({ inputData }) =>
      fault === 'bad-output'
        ? ({ verified: 'yes', risk: inputData.risk?.riskLevel } as unknown as VerificationResult) // malformed on purpose
        : decideVerification(inputData.identity, inputData.risk),
  });
  return createWorkflow({ id: SUBWORKFLOW_ID, inputSchema, outputSchema: VerificationResultSchema })
    .then(checkIdentity)
    .then(screenRisk)
    .then(decide)
    .commit();
}

export function buildOrderWorkflow(verification: ReturnType<typeof buildVerificationWorkflow>, fault: BoundaryFault) {
  const prepareOrder = createStep({
    id: 'prepareOrder',
    description: 'Computes the total and maps the order to the minimal verification input.',
    inputSchema: OrderSchema,
    outputSchema: VerificationInputSchema,
    execute: async ({ inputData: o }) => {
      const minimal = { email: o.customer.email, country: o.customer.country, total: orderTotal(o), notes: o.notes };
      // Contrast: hand the whole order over and rely on the subworkflow's schema to strip it.
      return fault === 'whole-order' || fault === 'loose-schema'
        ? ({ ...minimal, name: o.customer.name, shippingAddress: o.shippingAddress, items: o.items, cardLast4: o.cardLast4 } as VerificationInput)
        : minimal;
    },
  });
  const fulfil = createStep({
    id: 'fulfil',
    description: 'Confirms or holds the order from the verification result.',
    inputSchema: VerificationResultSchema,
    outputSchema: FulfilmentSchema,
    execute: async ({ inputData: v, getInitData }) => {
      const o = getInitData() as Order;
      return { orderId: o.orderId, decision: v.verified ? ('approved' as const) : ('held' as const), total: orderTotal(o), reasons: v.reasons };
    },
  });
  return createWorkflow({ id: 'order-workflow', inputSchema: OrderSchema, outputSchema: FulfilmentSchema })
    .then(prepareOrder)
    .then(verification)
    .then(fulfil)
    .commit();
}
