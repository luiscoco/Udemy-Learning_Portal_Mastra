import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { resilientCall, sleep, type AttemptRecord, type CircuitBreaker, type Outcome } from './resilience.js';

export const TRACKER_FAULTS = ['none', 'flaky', 'slow'] as const;
export const RECOMMENDATION_FAULTS = ['none', 'down'] as const;
export type TrackerFault = (typeof TRACKER_FAULTS)[number];
export type RecommendationFault = (typeof RECOMMENDATION_FAULTS)[number];

export const ORDERS: Record<string, { item: string; status: string; carrier: string; eta: string }> = {
  'ORD-5001': { item: 'Ceramic mug', status: 'shipped', carrier: 'ParcelCo', eta: 'Thursday' },
  'ORD-5002': { item: 'Espresso machine', status: 'packing', carrier: 'ParcelCo', eta: 'next Monday' },
};

const http = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

export interface DepConfig {
  attempts: number;
  timeoutMs: number;
  baseDelayMs: number;
  breaker: CircuitBreaker;
}

export interface DeskToolOptions {
  trackerFault: TrackerFault;
  recommendationsFault: RecommendationFault;
  deps: { tracker: DepConfig; recommendations: DepConfig };
  /** The current question's signal: cancelling a question aborts its in-flight tool calls. */
  signal: () => AbortSignal;
  onAttempt: (r: AttemptRecord) => void;
  onStart: (dep: string, attempt: number) => void;
}

export type Degraded = { ok: false; degraded: true; dependency: string; reason: Outcome; attempts: number };

/** The three desk tools. Failing dependencies return a degraded result instead of throwing (isolation). */
export function createDeskTools(o: DeskToolOptions) {
  let trackerCalls = 0;
  const call = async <T>(
    dep: 'tracker' | 'recommendations',
    fn: (signal: AbortSignal) => Promise<T>,
    toolSignal?: AbortSignal,
  ) => {
    const signals = [o.signal(), toolSignal].filter((s): s is AbortSignal => Boolean(s));
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    const r = await resilientCall(dep, fn, {
      ...o.deps[dep],
      signal,
      onAttempt: o.onAttempt,
      onStart: (n) => o.onStart(dep, n),
    });
    return r.ok
      ? (r.value as T)
      : ({ ok: false, degraded: true, dependency: dep, reason: r.outcome, attempts: r.attempts } satisfies Degraded);
  };
  const OrderId = z.object({ orderId: z.string().regex(/^ORD-\d{4}$/) });

  return {
    lookupOrder: createTool({
      id: 'lookupOrder',
      description: 'Looks up an order (ORD-1234): item and status. Reliable, local.',
      inputSchema: OrderId,
      execute: async ({ orderId }) => {
        const order = ORDERS[orderId];
        return order
          ? { ok: true, orderId, item: order.item, status: order.status }
          : { ok: false, orderId, reason: 'unknown order' };
      },
    }),
    trackShipment: createTool({
      id: 'trackShipment',
      description: 'Asks the carrier where a shipment is. A remote service: may be slow or fail.',
      inputSchema: OrderId,
      execute: async ({ orderId }, ctx) =>
        call(
          'tracker',
          async (signal) => {
            trackerCalls += 1;
            if (o.trackerFault === 'flaky' && trackerCalls <= 2) throw http(503);
            if (o.trackerFault === 'slow') await sleep(10 * 60_000, signal);
            const order = ORDERS[orderId];
            return order
              ? { ok: true, orderId, carrier: order.carrier, eta: order.eta }
              : { ok: false, orderId, reason: 'unknown order' };
          },
          (ctx as { abortSignal?: AbortSignal } | undefined)?.abortSignal,
        ),
    }),
    getRecommendations: createTool({
      id: 'getRecommendations',
      description: 'Suggests related products for an order. A remote service: may be down.',
      inputSchema: OrderId,
      execute: async ({ orderId }, ctx) =>
        call(
          'recommendations',
          async () => {
            if (o.recommendationsFault === 'down') throw http(503);
            return { ok: true, orderId, suggestions: ['Matching saucer', 'Gift box'] };
          },
          (ctx as { abortSignal?: AbortSignal } | undefined)?.abortSignal,
        ),
    }),
  };
}
