import { maskSecret } from '@mlp/contracts';

/** Resolves after `ms`, or rejects with the signal's reason as soon as it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Deep-redacts secret strings inside a JSON-serialisable value. */
export function redactValue<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0 || value === undefined) return value;
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return value;
  }
  if (text === undefined) return value;
  let changed = false;
  for (const s of secrets) {
    if (s.length >= 8 && text.includes(s)) {
      text = text.split(s).join(maskSecret(s));
      changed = true;
    }
  }
  return changed ? (JSON.parse(text) as T) : value;
}
