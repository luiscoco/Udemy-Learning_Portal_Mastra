import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

export const ROLES = ['learner', 'supervisor'] as const;
export type Role = (typeof ROLES)[number];

/** What every step reads from the workflow input: business data plus the learner's fault injection. */
export const RunInput = z.object({
  orderValue: z.number(),
  items: z.number().int(),
  failStep: z.string(),
  stepDelayMs: z.number().int(),
});
type RunInput = z.infer<typeof RunInput>;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** A business step: waits stepDelayMs (so the graph updates visibly), and fails when the learner says so. */
function step<O extends z.ZodTypeAny>(
  init: RunInput,
  id: string,
  description: string,
  outputSchema: O,
  produce: (init: RunInput, input: unknown) => z.infer<O>,
) {
  return createStep({
    id,
    description,
    inputSchema: z.any(),
    outputSchema,
    // Settings come from the closure: inside a nested workflow getInitData() is that workflow's own input.
    execute: async ({ inputData, abortSignal }) => {
      await sleep(init.stepDelayMs, abortSignal);
      if (init.failStep === id) throw new Error(`${id} failed (fault injection)`);
      return produce(init, inputData) as never; // z.infer and Mastra's schema inference name the same type differently
    },
  });
}

const Ok = z.object({ ok: z.boolean() });

export const TRACKING_ID = 'TRK-5521';
export const WRITER_INSTRUCTIONS =
  'You write the body of a shipping notification email in two short sentences. ' +
  'Mention the tracking id exactly as given. Do not use placeholders such as [Name].';

/**
 * The real model step (L68 live scenario): a Mastra agent run as a native workflow step via createStep(agent).
 * It takes { prompt } and returns { text }; its tokens stream through the workflow as AGENT output chunks.
 */
function emailWriter(model: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Agent({ id: 'emailWriter', name: 'Email writer', instructions: WRITER_INSTRUCTIONS, model: model as any });
}

function orderFulfilment(init: RunInput, model: unknown) {
  const shipping = createWorkflow({
    id: 'shipping',
    description: 'Book a courier, draft the email with a model, and send it.',
    inputSchema: z.any(),
    outputSchema: z.any(),
  })
    .then(
      step(init, 'bookCourier', 'Books a courier for the parcel.', z.object({ trackingId: z.string() }), () => ({
        trackingId: TRACKING_ID,
      })),
    )
    .then(
      step(init, 'prepareEmail', 'Builds the prompt for the email writer.', z.object({ prompt: z.string() }), (i, input) => ({
        prompt:
          `Tracking id: ${(input as { trackingId?: string }).trackingId ?? TRACKING_ID}. ` +
          `Order value: €${i.orderValue}, ${i.items} item${i.items === 1 ? '' : 's'}. Write the shipping notification.`,
      })),
    )
    .then(createStep(emailWriter(model)))
    .then(
      step(init, 'notifyCustomer', 'Sends the drafted email.', z.object({ ok: z.boolean(), email: z.string() }), (_i, input) => ({
        ok: true,
        email: String((input as { text?: string }).text ?? ''),
      })),
    )
    .commit();
  return createWorkflow({
    id: 'order-fulfilment',
    description: 'Validate, check, approve, pack and ship an order.',
    inputSchema: RunInput,
    outputSchema: z.any(),
  })
    .then(step(init, 'validateOrder', 'Checks the order is complete.', Ok, () => ({ ok: true })))
    .parallel([
      step(init, 'checkStock', 'Reserves the items in the warehouse.', Ok, () => ({ ok: true })),
      step(init, 'checkFraud', 'Scores the payment for fraud.', Ok, () => ({ ok: true })),
    ])
    .then(step(init, 'decide', 'Combines both checks.', z.object({ value: z.number() }), (init) => ({ value: init.orderValue })))
    .branch([
      [
        async ({ inputData }) => (inputData as { value: number }).value > 500,
        step(init, 'managerReview', 'A manager reviews orders above €500.', Ok, () => ({ ok: true })),
      ],
      [
        async ({ inputData }) => (inputData as { value: number }).value <= 500,
        step(init, 'autoApprove', 'Orders up to €500 are approved automatically.', Ok, () => ({ ok: true })),
      ],
    ])
    .then(
      step(init, 'listItems', 'Lists the items to pack.', z.array(z.number()), (init) =>
        Array.from({ length: init.items }, (_, i) => i + 1),
      ),
    )
    .foreach(
      step(init, 'packItem', 'Packs one item.', Ok, () => ({ ok: true })),
      { concurrency: 2 },
    )
    .then(shipping)
    .commit();
}

function refundOverride(init: RunInput, _model?: unknown) {
  return createWorkflow({
    id: 'refund-override',
    description: 'Override a refund decision.',
    inputSchema: RunInput,
    outputSchema: z.any(),
  })
    .then(step(init, 'loadCase', 'Loads the refund case.', Ok, () => ({ ok: true })))
    .then(step(init, 'overrideDecision', 'Records the supervisor override.', Ok, () => ({ ok: true })))
    .commit();
}

function payrollExport(init: RunInput, _model?: unknown) {
  return createWorkflow({
    id: 'payroll-export',
    description: 'Export payroll data.',
    inputSchema: RunInput,
    outputSchema: z.any(),
  })
    .then(step(init, 'collectSalaries', 'Collects salary records.', Ok, () => ({ ok: true })))
    .then(step(init, 'uploadToBank', 'Uploads the payment file.', Ok, () => ({ ok: true })))
    .commit();
}

/** The workflow catalog and who may see each workflow. Nobody in this lab may see payroll-export. */
export const CATALOG = {
  'order-fulfilment': { title: 'Order fulfilment', visibleTo: ['learner', 'supervisor'] as Role[], build: orderFulfilment },
  'refund-override': { title: 'Refund override', visibleTo: ['supervisor'] as Role[], build: refundOverride },
  'payroll-export': { title: 'Payroll export', visibleTo: [] as Role[], build: payrollExport },
} as const;
export type WorkflowId = keyof typeof CATALOG;

export const visibleFor = (role: Role) =>
  (Object.entries(CATALOG) as [WorkflowId, (typeof CATALOG)[WorkflowId]][])
    .filter(([, w]) => w.visibleTo.includes(role))
    .map(([id, w]) => ({ id, title: w.title }));

/** The workflow if the role may see it; otherwise undefined, exactly as for an id that does not exist. */
export function findVisible(id: string, role: Role) {
  const entry = Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id as WorkflowId] : undefined;
  return entry && entry.visibleTo.includes(role) ? { id: id as WorkflowId, ...entry } : undefined;
}
