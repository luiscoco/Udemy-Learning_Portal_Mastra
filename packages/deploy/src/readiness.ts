import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import type { ReadinessCheck, ReadinessResponse } from '@mlp/contracts';
import type { AppConfig } from './schema.js';

/** Failures the Configuration doctor lab may simulate; production probes never set any. */
export type SimulatedFailure = 'storage-down' | 'data-dir-read-only' | 'runner-draining';

export interface ReadinessOptions {
  config: AppConfig;
  /** The resolved data directory (MLP_DATA_DIR or the default). */
  dataDir: string;
  /** Whether the runner accepts new runs (false while shutting down). */
  acceptingRuns?: () => boolean;
  simulate?: ReadonlySet<SimulatedFailure>;
  /** Cache a result this long, so frequent probes do not hammer the disk. */
  cacheMs?: number;
  timeoutMs?: number;
}

const fileUrl = (file: string) => `file:${file.replace(/\\/g, '/')}`;

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Readiness: can this instance serve learners right now? Each dependency is checked for real (a write to the
 * data directory, a query on a probe database), and the answer says which one failed. Liveness (/api/health)
 * stays a plain "the process is up".
 */
export class ReadinessProbe {
  readonly #o: ReadinessOptions;
  #client: Client | undefined;
  #cached: { at: number; value: ReadinessResponse } | undefined;
  #closed = false;

  constructor(o: ReadinessOptions) {
    this.#o = o;
  }

  async check(): Promise<ReadinessResponse> {
    const cacheMs = this.#o.cacheMs ?? 2_000;
    if (this.#cached && Date.now() - this.#cached.at < cacheMs) return this.#cached.value;
    const checks = [
      await this.#run('config', async () => ({
        status: 'ok',
        message: `NODE_ENV=${this.#o.config.NODE_ENV}, validated at start-up`,
      })),
      await this.#run('data-dir', () => this.#dataDir()),
      await this.#run('storage', () => this.#storage()),
      await this.#run('web-bundle', async () => this.#webBundle()),
      await this.#run('providers', async () => this.#providers()),
      await this.#run('runner', async () =>
        this.#o.simulate?.has('runner-draining') || this.#o.acceptingRuns?.() === false
          ? { status: 'fail', message: 'the runner is draining (shutting down) and accepts no new runs' }
          : { status: 'ok', message: 'accepting runs' },
      ),
    ];
    const value: ReadinessResponse = {
      status: checks.some((c) => c.status === 'fail') ? 'not-ready' : 'ready',
      checks,
      timestamp: new Date().toISOString(),
    };
    this.#cached = { at: Date.now(), value };
    return value;
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#client?.close();
    this.#client = undefined;
  }

  async #run(
    name: ReadinessCheck['name'],
    fn: () => Promise<Pick<ReadinessCheck, 'status' | 'message'>>,
  ): Promise<ReadinessCheck> {
    const started = performance.now();
    try {
      const r = await fn();
      return { name, ...r, durationMs: Math.round(performance.now() - started) };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      return { name, status: 'fail', message: message.slice(0, 300), durationMs: Math.round(performance.now() - started) };
    }
  }

  async #dataDir(): Promise<Pick<ReadinessCheck, 'status' | 'message'>> {
    if (this.#o.simulate?.has('data-dir-read-only'))
      return { status: 'fail', message: 'the data directory is not writable (simulated)' };
    const probe = join(this.#o.dataDir, `.ready-${process.pid}`);
    try {
      mkdirSync(this.#o.dataDir, { recursive: true });
      writeFileSync(probe, String(Date.now()));
      rmSync(probe, { force: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? 'error';
      return { status: 'fail', message: `the data directory is not writable (${code})` };
    }
    return { status: 'ok', message: 'writable' };
  }

  async #storage(): Promise<Pick<ReadinessCheck, 'status' | 'message'>> {
    if (this.#o.simulate?.has('storage-down')) return { status: 'fail', message: 'storage did not answer (simulated)' };
    if (this.#closed) return { status: 'fail', message: 'the probe is closed' };
    // One long-lived client: opening a client per probe would leak file handles (libSQL on Windows keeps
    // closed files open until the process exits).
    if (!this.#client) {
      const dir = join(this.#o.dataDir, 'memory');
      mkdirSync(dir, { recursive: true });
      this.#client = createClient({ url: fileUrl(join(dir, 'ready-probe.db')) });
    }
    await withTimeout(this.#client.execute('SELECT 1'), this.#o.timeoutMs ?? 2_000, 'storage');
    return { status: 'ok', message: 'libSQL answered' };
  }

  #webBundle(): Pick<ReadinessCheck, 'status' | 'message'> {
    const dir = this.#o.config.WEB_DIST_DIR;
    if (!dir) return { status: 'skip', message: 'the web app is served elsewhere' };
    return existsSync(join(dir, 'index.html'))
      ? { status: 'ok', message: 'index.html present' }
      : { status: 'fail', message: 'WEB_DIST_DIR has no index.html (build the web app)' };
  }

  #providers(): Pick<ReadinessCheck, 'status' | 'message'> {
    const c = this.#o.config;
    if (c.MASTRA_MODE !== 'live') return { status: 'skip', message: 'offline mode: no provider needed' };
    const names = [
      c.OPENAI_API_KEY ? 'openai' : '',
      c.ANTHROPIC_API_KEY ? 'anthropic' : '',
      c.GOOGLE_API_KEY || c.GOOGLE_GENERATIVE_AI_API_KEY ? 'google' : '',
    ].filter(Boolean);
    // Key presence only: calling providers on every probe would cost money and make readiness depend on them.
    return names.length > 0
      ? { status: 'ok', message: `keys configured: ${names.join(', ')}` }
      : { status: 'fail', message: 'live mode without any provider key' };
  }
}
