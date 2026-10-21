import { z } from 'zod';
import { assertSafeAuthConfig, AuthConfigError, DevIdentityProvider } from '@mlp/auth';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { lab61Definition } from './definition.js';
import { startDemo } from './server.js';

const name = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{1,64}$/);
export const Lab61InputSchema = z
  .object({
    username: name,
    otherUser: name,
    passcode: z.string().min(8).max(120).optional(),
    ttlMs: z.number().int().min(1_000).max(60_000),
  })
  .refine((input) => input.username !== input.otherUser, { path: ['otherUser'], message: 'Choose a different second learner.' });
export type Lab61Input = z.infer<typeof Lab61InputSchema>;
export interface Lab61Output {
  statuses: {
    anonymous: number;
    login: number;
    ownerStart: number;
    ownerRead: number;
    tampered: number;
    expired: number;
    otherLearner: number;
    logout: number;
    afterLogout: number;
    crossOrigin: number;
  };
  cookie: { httpOnly: boolean; sameSiteStrict: boolean; apiPath: boolean };
  productionRefused: boolean;
  credentialsAbsent: boolean;
  resourcesReleased: boolean;
}

export const lab61: LabImplementation<Lab61Input, Lab61Output, LabServices> = {
  definition: lab61Definition as LabDefinition,
  inputSchema: Lab61InputSchema,
  async run(ctx, input) {
    const demo = await startDemo({
      users: [input.username, input.otherUser],
      password: input.passcode,
      ttlMs: input.ttlMs,
      signal: ctx.signal,
    });
    const bodies: string[] = [];
    const credentials: string[] = [demo.secret, ...(input.passcode ? [input.passcode] : [])];
    const call = async (path: string, init?: RequestInit) => {
      ctx.throwIfAborted();
      const res = await fetch(demo.base + path, { ...init, signal: ctx.signal });
      const text = await res.text();
      bodies.push(text);
      return { status: res.status, text, cookie: res.headers.get('set-cookie') };
    };
    const login = async (username: string) => {
      const response = await call('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: input.passcode }),
      });
      const cookie = response.cookie?.split(';')[0];
      if (response.status !== 200 || !cookie) throw new Error('Demo login failed');
      credentials.push(cookie.split('=')[1]!);
      return { ...response, value: cookie };
    };
    const step = (stepId: string, status: 'running' | 'success', output?: unknown) =>
      ctx.emit({ type: 'workflow-step', stepId, status, ...(output === undefined ? {} : { output }) });
    try {
      step('anonymous and owner', 'running');
      const anonymous = await call('/api/runs', { method: 'POST' });
      const owner = await login(input.username);
      const started = await call('/api/runs', { method: 'POST', headers: { cookie: owner.value } });
      const runId = (JSON.parse(started.text) as { runId: string }).runId;
      const path = `/api/runs/${runId}`;
      const ownerRead = await call(path, { headers: { cookie: owner.value } });
      const flags = owner.cookie ?? '';
      step('anonymous and owner', 'success', {
        anonymous: anonymous.status,
        ownerStart: started.status,
        ownerRead: ownerRead.status,
      });

      step('tampering and ownership', 'running');
      const altered = owner.value.slice(0, -1) + (owner.value.endsWith('A') ? 'B' : 'A');
      const tampered = await call(path, { headers: { cookie: altered } });
      const other = await login(input.otherUser);
      const crossTenant = await call(path, { headers: { cookie: other.value } });
      const crossOrigin = await call('/api/runs', {
        method: 'POST',
        headers: { cookie: owner.value, origin: 'https://foreign.example' },
      });
      step('tampering and ownership', 'success', {
        tampered: tampered.status,
        otherLearner: crossTenant.status,
        crossOrigin: crossOrigin.status,
      });

      step('expiry and revocation', 'running');
      demo.advance(input.ttlMs); // deterministic clock: no sleep and no changes to the application's real clock.
      const expired = await call(path, { headers: { cookie: owner.value } });
      const renewed = await login(input.username);
      const logout = await call('/api/auth/logout', { method: 'POST', headers: { cookie: renewed.value } });
      const afterLogout = await call(path, { headers: { cookie: renewed.value } });
      step('expiry and revocation', 'success', { expired: expired.status, afterLogout: afterLogout.status });

      let productionRefused = false;
      try {
        assertSafeAuthConfig({
          nodeEnv: 'production',
          host: '127.0.0.1',
          provider: new DevIdentityProvider({ users: [input.username] }),
        });
      } catch (err) {
        if (!(err instanceof AuthConfigError)) throw err;
        productionRefused = true;
      }
      const visible = JSON.stringify({ bodies, logs: demo.logs });
      const credentialsAbsent = credentials.every((value) => !visible.includes(value));
      ctx.log('info', 'Real loopback HTTP probes completed; credentials stay inside the demo server and Set-Cookie headers.');
      await demo.close();
      return {
        statuses: {
          anonymous: anonymous.status,
          login: owner.status,
          ownerStart: started.status,
          ownerRead: ownerRead.status,
          tampered: tampered.status,
          expired: expired.status,
          otherLearner: crossTenant.status,
          logout: logout.status,
          afterLogout: afterLogout.status,
          crossOrigin: crossOrigin.status,
        },
        cookie: {
          httpOnly: flags.includes('; HttpOnly'),
          sameSiteStrict: flags.includes('; SameSite=Strict'),
          apiPath: flags.includes('; Path=/api'),
        },
        productionRefused,
        credentialsAbsent,
        resourcesReleased: demo.closed,
      };
    } finally {
      if (!demo.closed) await demo.close();
    }
  },
  validate(out) {
    const s = out.statuses;
    return summarizeChecks([
      { id: 'anonymous-refused', label: 'Anonymous execution is refused', passed: s.anonymous === 401 },
      {
        id: 'owner-allowed',
        label: 'The signed-in owner can start and read a run',
        passed: s.login === 200 && s.ownerStart === 202 && s.ownerRead === 200,
      },
      {
        id: 'cookie-hardened',
        label: 'The session cookie is HttpOnly, SameSite=Strict and scoped to /api',
        passed: Object.values(out.cookie).every(Boolean),
      },
      { id: 'tampering-refused', label: 'An altered cookie is refused', passed: s.tampered === 401 },
      { id: 'expiry-enforced', label: 'The server rejects an expired session', passed: s.expired === 401 },
      { id: 'ownership-enforced', label: 'Another learner cannot read the run', passed: s.otherLearner === 404 },
      { id: 'logout-revokes', label: 'Logout revokes the stored session', passed: s.logout === 200 && s.afterLogout === 401 },
      { id: 'origin-enforced', label: 'Foreign-origin mutations are refused', passed: s.crossOrigin === 403 },
      { id: 'production-refused', label: 'The development provider is refused in production', passed: out.productionRefused },
      {
        id: 'credentials-absent',
        label: 'Responses and logs contain no session credentials or passcode',
        passed: out.credentialsAbsent,
      },
      { id: 'resources-released', label: 'The demo closes its server and connections', passed: out.resourcesReleased },
    ]);
  },
};
