import { z } from 'zod';

const OrderId = z.string().regex(/^ORD-\d{6}$/, 'Order ids look like ORD-123456');

/** Discriminated union: the `action` field decides which other fields are required. */
export const SupportActionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('refund'),
    orderId: OrderId,
    amountCents: z.number().int('Use whole cents').positive('Must be more than 0').max(50_000, 'Refunds above $500 need a human'),
    reason: z.enum(['damaged', 'late', 'wrong-item', 'other']),
  }),
  z.object({
    action: z.literal('exchange'),
    orderId: OrderId,
    sku: z.string().regex(/^[A-Z]{3}-\d{4}$/, 'SKUs look like TSH-0042'),
    size: z.enum(['XS', 'S', 'M', 'L', 'XL']),
  }),
]);
export type SupportActionInput = z.infer<typeof SupportActionInputSchema>;

/** Typed output, also a discriminated union. */
export const SupportActionOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('accepted'),
    ticketId: z.string().regex(/^TCK-\d{4}$/),
    action: z.enum(['refund', 'exchange']),
    summary: z.string(),
  }),
  z.object({ status: z.literal('rejected'), reason: z.string() }),
]);
export type SupportActionOutput = z.infer<typeof SupportActionOutputSchema>;

export interface FieldError {
  path: string;
  message: string;
}

/** Field-level errors for arbitrary (possibly invalid) arguments, as shown to learners. */
export function fieldErrors(args: unknown): FieldError[] {
  const r = SupportActionInputSchema.safeParse(args);
  if (r.success) return [];
  return r.error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message }));
}

/** Business logic (deterministic). Only ever called with already-validated input. */
export function performSupportAction(input: SupportActionInput): SupportActionOutput {
  const n = Number(input.orderId.slice(-4));
  if (input.action === 'refund') {
    return {
      status: 'accepted',
      ticketId: `TCK-${String(n).padStart(4, '0')}`,
      action: 'refund',
      summary: `Refund of $${(input.amountCents / 100).toFixed(2)} for ${input.orderId} (${input.reason})`,
    };
  }
  return {
    status: 'accepted',
    ticketId: `TCK-${String((n + 5000) % 10000).padStart(4, '0')}`,
    action: 'exchange',
    summary: `Exchange ${input.sku} to size ${input.size} for ${input.orderId}`,
  };
}
