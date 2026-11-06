import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptedLanguageModel } from '@mlp/mastra-runtime';
import type { ModelService } from '@mlp/labs';
import { lab01Definition } from '../../../packages/labs/src/lab-01/definition';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createLabRegistry } from '@mlp/labs';
import { TUTOR_ANSWER_LIMIT, type TutorEvent } from '@mlp/contracts';
import { createApiClient } from '@mlp/client';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';
import { signIn } from './test-auth.js';
import { createTutorProvider, offlineTutor, safeTutorText, tutorContext, type TutorProvider } from './tutor.js';

const resources: { api: ApiApp; server: Server }[] = [];
afterEach(async () => {
  for (const { api, server } of resources.splice(0)) {
    api.drain();
    await api.runner.dispose();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
  vi.unstubAllEnvs();
});

async function setup(provider?: TutorProvider, config: Record<string, string> = {}) {
  const api = createApp({
    config: parseConfig({ NODE_ENV: 'test', AUTH_DEV_USERS: 'alice,bob', AUTH_LOGIN_RATE_MAX: '100', ...config }),
    logger: createLogger('silent'),
    memoryDir: testMemoryDir('tutor-api'),
    tutorProvider: provider,
  });
  const server = api.app.listen(0, '127.0.0.1');
  resources.push({ api, server });
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const alice = await signIn(base, 'alice');
  const bob = await signIn(base, 'bob');
  const post = (body: unknown, cookie = alice, headers: Record<string, string> = {}, signal?: AbortSignal) =>
    fetch(`${base}/api/tutor/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-run-subject': 'dev%3Aalice', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  return { api, base, alice, bob, post };
}
const request = { labId: 'lab-01', mode: 'offline', question: 'Give me a hint' };
async function events(response: Response): Promise<TutorEvent[]> {
  return (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.slice(6)) as TutorEvent);
}

describe('AI Tutor boundaries', () => {
  it('provides valid offline teaching guidance for all 76 lessons', () => {
    const definitions = createLabRegistry().definitions();
    expect(definitions).toHaveLength(76);
    for (const lesson of definitions)
      for (const question of ['Explain', 'Hint', 'Debug']) {
        const text = offlineTutor(lesson, question);
        expect(text.length, lesson.id).toBeLessThanOrEqual(TUTOR_ANSWER_LIMIT);
        expect(text, lesson.id).not.toContain('[object Object]');
        expect(text, lesson.id).toContain(lesson.title);
      }
  });
  it('treats provider token-limit finishes as incomplete instead of success', async () => {
    const model = new ScriptedLanguageModel({ script: () => ({ text: 'Partial answer', finishReason: 'length' }) });
    const models = { resolve: () => ({ model, modelId: 'openai/gpt-4o-mini', simulated: false }) } as unknown as ModelService;
    await expect(
      createTutorProvider(models)({
        lesson: lab01Definition,
        request: { ...request, mode: 'live', modelId: 'openai/gpt-4o-mini' },
        signal: new AbortController().signal,
        emitText: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
  it('uses teaching context without solution files, quiz answers or notes and gives relevant offline guidance', () => {
    const context = JSON.parse(tutorContext(lab01Definition));
    expect(context.title).toBe(lab01Definition.title);
    expect(context).not.toHaveProperty('quiz');
    expect(context).not.toHaveProperty('exercise');
    expect(context).not.toHaveProperty('sourceFiles');
    expect(offlineTutor(lab01Definition, 'hint')).toContain(lab01Definition.guide.hints[0]!.text);
    expect(offlineTutor(lab01Definition, 'debug')).toContain(lab01Definition.guide.commonMistakes[0]!.fix);
    expect(offlineTutor(lab01Definition, 'explain')).toContain(lab01Definition.concept);
    expect(offlineTutor(lab01Definition, 'hint')).not.toContain('[object Object]');
  });
  it('masks configured credentials even when their text is split between chunks', () => {
    const secret = 'sk-private-tutor-key-123456789';
    expect(safeTutorText(`hello ${secret.slice(0, 12)}`, [secret])).toBe('hello ');
    expect(safeTutorText(`hello ${secret}`, [secret], true)).toBe('hello [redacted]');
  });
  it('runs the real Mastra streaming adapter against an injected scripted model, with no provider network', async () => {
    const resolve = vi.fn(() => ({
      model: new ScriptedLanguageModel({ script: () => ({ text: '## Example\n\n```ts\nconst ready = true;\n```' }) }),
      modelId: 'openai/gpt-4o-mini',
      simulated: false,
    }));
    let answer = '';
    await createTutorProvider({ resolve } as unknown as ModelService)({
      lesson: lab01Definition,
      request: { ...request, mode: 'live', modelId: 'openai/gpt-4o-mini' },
      signal: new AbortController().signal,
      emitText: (text) => {
        answer += text;
      },
    });
    expect(answer).toContain('const ready = true;');
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ mode: 'live' }));
  });
  it('streams free lesson-specific guidance through the SDK without changing progress', async () => {
    const { base, alice } = await setup();
    const fetchWithCookie: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, cookie: alice } });
    const client = createApiClient({ baseUrl: base, fetch: fetchWithCookie });
    const before = await client.progress.get('dev:alice');
    const received: TutorEvent[] = [];
    await client.tutor.answer('dev:alice', { ...request, mode: 'offline' }, (e) => received.push(e));
    expect(received[0]).toMatchObject({ type: 'started', simulated: true, modelId: null });
    expect(received.at(-1)).toMatchObject({
      type: 'complete',
      text: expect.stringContaining(lab01Definition.guide.hints[0]!.text),
    });
    expect(await client.progress.get('dev:alice')).toEqual(before);
    expect((await client.tutor.settings()).liveEnabled).toBe(false);
  });
  it('refuses unauthenticated, mismatched-account, origin, invalid and unconfigured calls before invoking a provider', async () => {
    const provider = vi.fn<TutorProvider>();
    const { post, bob } = await setup(provider);
    expect((await post(request, '')).status).toBe(401);
    expect((await post(request, bob)).status).toBe(404);
    expect((await post(request, undefined, { origin: 'https://evil.example' })).status).toBe(403);
    for (const body of [
      { ...request, question: '' },
      { ...request, question: 'x'.repeat(2001) },
      { ...request, sessionId: 'secret' },
    ])
      expect((await post(body)).status).toBe(422);
    expect((await post({ ...request, labId: 'lab-99' })).status).toBe(404);
    expect((await post({ ...request, mode: 'live', modelId: 'openai/gpt-4o-mini' })).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
  it('enforces a deadline even when a provider ignores cancellation, then releases its slot', async () => {
    let signal: AbortSignal | undefined;
    const provider: TutorProvider = (input) => {
      signal = input.signal;
      input.emitText('Partial answer');
      return new Promise(() => undefined);
    };
    const { post } = await setup(provider, { RUN_MAX_TIMEOUT_MS: '1000', MAX_CONCURRENT_RUNS: '1' });
    const output = await events(await post(request));
    expect(output.at(-1)).toMatchObject({ type: 'error', code: 'TIMEOUT' });
    expect(signal?.aborted).toBe(true);
    expect((await events(await post(request))).at(-1)).toMatchObject({ type: 'error', code: 'TIMEOUT' });
  });
  it('preserves safe partial text and never marks provider failure or excessive/empty output complete', async () => {
    const provider = vi
      .fn<TutorProvider>()
      .mockImplementationOnce(async ({ emitText }) => {
        emitText('Some partial explanation');
        throw new Error('private error');
      })
      .mockImplementationOnce(async ({ emitText }) => {
        emitText('x'.repeat(TUTOR_ANSWER_LIMIT + 1));
      })
      .mockImplementationOnce(async () => undefined);
    const { post } = await setup(provider);
    for (let i = 0; i < 3; i++) {
      const output = await events(await post(request));
      expect(output.at(-1)?.type).toBe('error');
      expect(output.some((e) => e.type === 'complete')).toBe(false);
      expect(JSON.stringify(output)).not.toContain('private error');
    }
  });
  it('applies rate admission and global concurrency without leaking another account request', async () => {
    const { post, api } = await setup(async () => new Promise(() => undefined), {
      RUN_START_RATE_USER_MAX: '2',
      MAX_CONCURRENT_RUNS: '1',
    });
    const first = await post(request);
    expect(first.status).toBe(200);
    expect((await post(request)).status).toBe(429);
    const rate = await post(request);
    expect(rate.status).toBe(429);
    expect(rate.headers.get('retry-after')).toBeTruthy();
    api.drain();
    await first.body?.cancel();
  });
  it('aborts a provider on client disconnect', async () => {
    let signal: AbortSignal | undefined;
    const { post } = await setup(async (input) => {
      signal = input.signal;
      input.emitText('Partial');
      await new Promise(() => undefined);
    });
    const ctrl = new AbortController();
    const response = await post(request, undefined, {}, ctrl.signal);
    expect(response.status).toBe(200);
    ctrl.abort();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  });
  it('keeps live provenance, masks output secrets and does not substitute an offline answer', async () => {
    const key = 'sk-test-tutor-1234567890';
    vi.stubEnv('OPENAI_API_KEY', key);
    const { post, base } = await setup(
      async ({ request, emitText }) => {
        expect(request.question).not.toContain(key);
        emitText(`Answer ${key.slice(0, 10)}`);
        emitText(key.slice(10));
      },
      { MASTRA_MODE: 'live', OPENAI_API_KEY: key },
    );
    const settings = await (await fetch(`${base}/api/tutor/settings`)).text();
    expect(settings).not.toContain(key);
    const output = await events(
      await post({ ...request, question: `Explain ${key}`, mode: 'live', modelId: 'openai/gpt-4o-mini' }),
    );
    expect(output[0]).toMatchObject({ type: 'started', simulated: false });
    expect(output.at(-1)).toMatchObject({ type: 'complete', text: 'Answer [redacted]' });
    expect(JSON.stringify(output)).not.toContain(key.slice(0, 10));
  });
});
