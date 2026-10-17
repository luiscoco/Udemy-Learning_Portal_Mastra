import { z } from 'zod';

/** Only these hosts may ever be called by the weather tool (checked before every request). */
export const ALLOWED_HOSTS = new Set(['api.open-meteo.com']);

/** Fixed city table so the model never supplies URLs or coordinates. */
export const CITIES = {
  Madrid: { latitude: 40.4168, longitude: -3.7038 },
  Lisbon: { latitude: 38.7223, longitude: -9.1393 },
  London: { latitude: 51.5072, longitude: -0.1276 },
  Tokyo: { latitude: 35.6762, longitude: 139.6503 },
  'New York': { latitude: 40.7128, longitude: -74.006 },
} as const;
export type City = keyof typeof CITIES;
export const CITY_NAMES = Object.keys(CITIES) as [City, ...City[]];

export function forecastUrl(city: City): URL {
  const c = CITIES[city];
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(c.latitude));
  url.searchParams.set('longitude', String(c.longitude));
  url.searchParams.set('current', 'temperature_2m,wind_speed_10m,weather_code');
  url.searchParams.set('timezone', 'UTC');
  return url;
}

/** Response shape verified against the real API (see recorded example in mock.ts). */
export const ForecastResponseSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    wind_speed_10m: z.number(),
    weather_code: z.number().int(),
  }),
  current_units: z.object({ temperature_2m: z.string(), wind_speed_10m: z.string() }),
});

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Transport abstraction: real fetch in live data mode, a local mock offline. */
export interface HttpClient {
  readonly kind: 'mock' | 'network';
  get(url: URL, signal: AbortSignal): Promise<HttpResponse>;
}

export const networkClient: HttpClient = {
  kind: 'network',
  async get(url, signal) {
    const res = await fetch(url, { signal, redirect: 'error', headers: { accept: 'application/json' } });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    // Bound the body size: never buffer unbounded third-party responses.
    const body = (await res.text()).slice(0, 100_000);
    return { status: res.status, headers, body };
  },
};

/** Simple sliding-window limiter (client-side), shared per process. */
export class RateLimiter {
  private hits: number[] = [];
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  tryAcquire(): { ok: true } | { ok: false; retryAfterMs: number } {
    const t = this.now();
    this.hits = this.hits.filter((h) => t - h < this.windowMs);
    if (this.hits.length >= this.max) return { ok: false, retryAfterMs: this.windowMs - (t - this.hits[0]!) };
    this.hits.push(t);
    return { ok: true };
  }
}
