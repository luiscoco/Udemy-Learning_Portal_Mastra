import { describe, expect, it } from 'vitest';
import { KeyedLock } from './keyed-lock.js';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedLock', () => {
  it('serializes work on the same key and runs other keys in parallel', async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    const job = (key: string, name: string, ms: number) =>
      lock.run(key, async () => {
        log.push(`start ${name}`);
        await tick(ms);
        log.push(`end ${name}`);
      });
    await Promise.all([job('a', 'a1', 30), job('a', 'a2', 1), job('b', 'b1', 5)]);
    expect(log.indexOf('end a1')).toBeLessThan(log.indexOf('start a2'));
    expect(log.indexOf('start b1')).toBeLessThan(log.indexOf('end a1'));
    expect(lock.size).toBe(0);
  });

  it('releases on error and stops waiting when aborted', async () => {
    const lock = new KeyedLock();
    await expect(lock.run('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    const holder = lock.run('k', () => tick(50));
    const ctrl = new AbortController();
    const waiter = lock.run('k', async () => 'ran', ctrl.signal);
    ctrl.abort(new Error('cancelled'));
    await expect(waiter).rejects.toThrow('cancelled');
    await holder;
    expect(await lock.run('k', async () => 'free')).toBe('free');
  });
});
