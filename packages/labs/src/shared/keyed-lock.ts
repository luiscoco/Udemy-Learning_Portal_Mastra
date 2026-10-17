/**
 * Serializes async work per key inside this process (for example, all runs on one memory thread),
 * so two runs never interleave writes, resets and reads on the same conversation.
 * Waiting honours an AbortSignal; the lock is always released, also when the work throws.
 */
export class KeyedLock {
  readonly #tails = new Map<string, Promise<void>>();

  async run<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const tail = previous.then(() => mine);
    this.#tails.set(key, tail);
    try {
      await (signal
        ? Promise.race([
            previous,
            new Promise<never>((_, reject) => {
              if (signal.aborted) reject(signal.reason);
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
          ])
        : previous);
      return await work();
    } finally {
      release();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }

  /** Number of keys currently held or waited on (for tests). */
  get size(): number {
    return this.#tails.size;
  }
}
