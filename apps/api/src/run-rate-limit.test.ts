import { describe, expect, it } from 'vitest';
import { clientNetwork, RunRateLimiter, type RunRatePolicy } from './run-rate-limit.js';

const policy: RunRatePolicy = { windowMs: 2000, start: { user: 2, ip: 3 }, control: { user: 1, ip: 2 } };

it('denies atomically, rounds the longest wait and never slides a blocked window', () => {
  let now = 0;
  const limiter = new RunRateLimiter(policy, () => now);
  expect(limiter.take('start', 'alice', '192.0.2.1')).toBe(0);
  now = 500;
  expect(limiter.take('start', 'alice', '192.0.2.2')).toBe(0);
  expect(limiter.take('start', 'alice', '192.0.2.3')).toBe(2);
  // Alice's rejection did not create/spend the otherwise fresh IP allowance.
  for (const owner of ['bob', 'carol', 'dan']) expect(limiter.take('start', owner, '192.0.2.3')).toBe(0);
  now = 1999;
  expect(limiter.take('start', 'alice', '192.0.2.3')).toBe(1);
  now = 2000;
  expect(limiter.take('start', 'alice', '192.0.2.3')).toBe(1); // IP window remains until 2500.
  expect(limiter.take('start', 'alice', '192.0.2.4')).toBe(0); // rejected request did not spend user slot
  now = 2500;
  expect(limiter.take('start', 'alice', '192.0.2.3')).toBe(0);
});

it('isolates families and owners while sharing each client network across owners', () => {
  const limiter = new RunRateLimiter(policy, () => 0);
  for (const owner of ['alice', 'bob', 'carol']) expect(limiter.take('start', owner, '192.0.2.1')).toBe(0);
  expect(limiter.take('start', 'dan', '192.0.2.1')).toBe(2);
  expect(limiter.take('start', 'dan', '192.0.2.2')).toBe(0);
  expect(limiter.take('control', 'alice', '192.0.2.1')).toBe(0);
  expect(limiter.take('control', 'alice', '192.0.2.2')).toBe(2);
  expect(limiter.take('control', 'bob', '192.0.2.1')).toBe(0);
  expect(limiter.take('control', 'carol', '192.0.2.1')).toBe(2);
});

it('fails closed at capacity without evicting active limits, then reclaims expired state', () => {
  let now = 0;
  const limiter = new RunRateLimiter(policy, () => now, 3);
  expect(limiter.take('start', 'alice', '192.0.2.1')).toBe(0);
  expect(limiter.take('start', 'bob', '192.0.2.2')).toBe(2); // needs two slots, only one free
  expect(limiter.take('start', 'alice', '192.0.2.1')).toBe(0);
  expect(limiter.take('start', 'alice', '192.0.2.1')).toBe(2);
  expect(limiter.take('start', 'bob', '192.0.2.1')).toBe(0); // can use the single free slot
  expect(limiter.take('control', 'alice', '192.0.2.1')).toBe(2);
  now = 2000;
  expect(limiter.take('control', 'alice', '192.0.2.1')).toBe(0);
});

describe('network identity normalization', () => {
  it.each([
    ['127.0.0.1', 'v4:127.0.0.1'],
    ['::ffff:127.0.0.1', 'v4:127.0.0.1'],
    ['0:0:0:0:0:FFFF:7f00:0001', 'v4:127.0.0.1'],
    ['2001:0DB8:0001:0002::1', 'v6:2001:db8:1:2/64'],
    ['2001:db8:1:2:ffff:ffff:ffff:ffff', 'v6:2001:db8:1:2/64'],
    ['2001:db8:1:3::1', 'v6:2001:db8:1:3/64'],
    ['::1', 'v6:0:0:0:0/64'],
    ['fe80::1%eth0', 'v6:fe80:0:0:0/64'],
    ['not-an-ip', 'unknown'],
    ['', 'unknown'],
    [undefined, 'unknown'],
  ])('%s maps to %s', (address, expected) => expect(clientNetwork(address)).toBe(expected));
  it('shares IPv6 /64 and mapped IPv4 aliases in actual accounting', () => {
    const limiter = new RunRateLimiter({ ...policy, start: { user: 10, ip: 1 } }, () => 0);
    expect(limiter.take('start', 'alice', '::ffff:127.0.0.1')).toBe(0);
    expect(limiter.take('start', 'bob', '127.0.0.1')).toBe(2);
    expect(limiter.take('start', 'alice', '2001:db8:1:2::1')).toBe(0);
    expect(limiter.take('start', 'bob', '2001:0DB8:1:2:ffff::1')).toBe(2);
    expect(limiter.take('start', 'bob', '2001:db8:1:3::1')).toBe(0);
  });
});
