import { describe, expect, it } from 'vitest';
import { assertSafeAuthConfig, hashUserEntry, PasswordIdentityProvider } from './index.js';

const PW = 'correct horse battery';

describe('PasswordIdentityProvider', () => {
  it('verifies scrypt-hashed users and treats wrong passwords and unknown users alike', async () => {
    const entry = await hashUserEntry('Ana', PW);
    expect(entry).toMatch(/^ana:scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(entry).not.toContain(PW);
    const p = new PasswordIdentityProvider({ users: `${entry}, ${await hashUserEntry('bo', 'another long password')}` });
    expect(await p.authenticate({ username: 'ANA', password: PW })).toEqual({
      sub: 'password:ana',
      name: 'ana',
      provider: 'password',
    });
    expect(await p.authenticate({ username: 'ana', password: 'wrong password!!' })).toBeNull();
    expect(await p.authenticate({ username: 'nobody', password: PW })).toBeNull();
    expect(await p.authenticate({ username: 'ana' })).toBeNull();
  });

  it('is production-capable and allowed on a public host in production', async () => {
    const p = new PasswordIdentityProvider({ users: await hashUserEntry('ana', PW) });
    expect(p.production).toBe(true);
    expect(() => assertSafeAuthConfig({ nodeEnv: 'production', host: '0.0.0.0', provider: p })).not.toThrow();
  });

  it('rejects malformed entries without echoing them, weak parameters and short passwords', async () => {
    const bad = 'ana:plaintext-password';
    expect(() => new PasswordIdentityProvider({ users: bad })).toThrow(/invalid entry \(#1\)/);
    try {
      new PasswordIdentityProvider({ users: bad });
    } catch (e) {
      expect((e as Error).message).not.toContain('plaintext');
    }
    const weak = (await hashUserEntry('ana', PW)).replace('scrypt$16384$', 'scrypt$1024$');
    expect(() => new PasswordIdentityProvider({ users: weak })).toThrow(/at least 16384/);
    expect(() => new PasswordIdentityProvider({ users: '' })).toThrow(/no users/);
    await expect(hashUserEntry('ana', 'short')).rejects.toThrow(/at least 12/);
  });
});
