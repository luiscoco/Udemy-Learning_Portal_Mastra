import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';
import { LabError } from '@mlp/lab-engine';

export type RunRequestFamily = 'start' | 'control';
export interface RunRatePolicy {
  windowMs: number;
  start: { user: number; ip: number };
  control: { user: number; ip: number };
}

/** Canonical IPv4, including mapped IPv4; IPv6 privacy addresses share their /64. */
export function clientNetwork(address: string | undefined): string {
  if (!address) return 'unknown';
  const ip = address.split('%')[0]!;
  if (isIP(ip) === 4) return `v4:${ip}`;
  if (isIP(ip) !== 6) return 'unknown';
  const dotted = ip.slice(ip.lastIndexOf(':') + 1);
  let hex = ip;
  if (isIP(dotted) === 4) {
    const octets = dotted.split('.').map(Number);
    hex =
      ip.slice(0, ip.lastIndexOf(':') + 1) +
      ((octets[0]! << 8) | octets[1]!).toString(16) +
      ':' +
      ((octets[2]! << 8) | octets[3]!).toString(16);
  }
  const halves = hex.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const groups = (
    halves.length === 1 ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
  ).map((part) => Number.parseInt(part, 16));
  if (groups.slice(0, 5).every((v) => v === 0) && groups[5] === 0xffff)
    return `v4:${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
  return `v6:${groups
    .slice(0, 4)
    .map((v) => v.toString(16))
    .join(':')}/64`;
}

interface Bucket {
  count: number;
  expiresAt: number;
}
const key = (family: RunRequestFamily, kind: 'user' | 'ip', value: string) =>
  createHash('sha256')
    .update(JSON.stringify([family, kind, value]))
    .digest('hex');

/** One synchronous, atomic admission decision for both buckets; no active-state eviction. */
export class RunRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly policy: RunRatePolicy,
    private readonly now: () => number = () => performance.now(),
    private readonly maxEntries = 10_000,
  ) {
    const limits = [policy.start.user, policy.start.ip, policy.control.user, policy.control.ip];
    if (
      !Number.isInteger(policy.windowMs) ||
      policy.windowMs < 1 ||
      limits.some((v) => !Number.isInteger(v) || v < 1) ||
      !Number.isInteger(maxEntries) ||
      maxEntries < 2
    )
      throw new Error('Invalid run request policy');
  }

  /** Zero means admitted. A positive value is Retry-After seconds. Denials change no active bucket. */
  take(family: RunRequestFamily, subject: string, address: string | undefined): number {
    const now = this.now();
    for (const [id, bucket] of this.buckets) if (bucket.expiresAt <= now) this.buckets.delete(id);
    const wanted = [
      { id: key(family, 'user', subject), max: this.policy[family].user },
      { id: key(family, 'ip', clientNetwork(address)), max: this.policy[family].ip },
    ];
    let waitMs = 0;
    for (const { id, max } of wanted) {
      const bucket = this.buckets.get(id);
      if (bucket && bucket.count >= max) waitMs = Math.max(waitMs, bucket.expiresAt - now);
    }
    const missing = wanted.filter(({ id }) => !this.buckets.has(id)).length;
    const needed = this.buckets.size + missing - this.maxEntries;
    if (needed > 0) {
      // At most two new buckets per request. Wait until enough slots can expire, without eviction.
      const expiries = [...this.buckets.values()].map((b) => b.expiresAt).sort((a, b) => a - b);
      waitMs = Math.max(waitMs, expiries[needed - 1]! - now);
    }
    if (waitMs > 0) return Math.max(1, Math.ceil(waitMs / 1000));
    for (const { id } of wanted) {
      const bucket = this.buckets.get(id);
      if (bucket) ++bucket.count;
      else this.buckets.set(id, { count: 1, expiresAt: now + this.policy.windowMs });
    }
    return 0;
  }

  middleware(family: RunRequestFamily): RequestHandler {
    return (req, res, next) => {
      if (!req.principal) throw new LabError('UNAUTHORIZED', 'Sign in to run labs.');
      const seconds = this.take(family, req.principal.sub, req.ip ?? req.socket.remoteAddress);
      if (seconds) {
        res.setHeader('Retry-After', String(seconds));
        res.setHeader('Cache-Control', 'no-store');
        throw new LabError(
          'TOO_MANY_REQUESTS',
          `Too many ${family === 'start' ? 'run starts' : 'approval or recovery requests'}. Try again in ${seconds} seconds.`,
          { retryable: true },
        );
      }
      next();
    };
  }
}
