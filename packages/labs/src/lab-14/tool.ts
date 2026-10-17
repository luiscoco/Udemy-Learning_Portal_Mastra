import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { ALLOWED_HOSTS, CITY_NAMES, forecastUrl, ForecastResponseSchema, type HttpClient, type RateLimiter } from './http.js';

export const WeatherResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    city: z.string(),
    temperatureC: z.number(),
    windKmh: z.number(),
    weatherCode: z.number().int(),
    observedAt: z.string(),
    source: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    city: z.string(),
    code: z.enum(['TIMEOUT', 'RATE_LIMITED', 'UPSTREAM_ERROR', 'BAD_RESPONSE', 'NOT_ALLOWED', 'NETWORK']),
    message: z.string(),
    retryable: z.boolean(),
    retryAfterSeconds: z.number().optional(),
  }),
]);
export type WeatherResult = z.infer<typeof WeatherResultSchema>;

export interface CallRecord {
  url: string;
  host: string;
  allowed: boolean;
  status: number | null;
  durationMs: number;
  /** 'ok' or the error code returned to the model. */
  outcome: string;
}

/**
 * Builds the weather tool around a transport. The tool never throws for upstream problems: it
 * returns a typed error the model can explain. Requests are allowlisted, time-limited and rate-limited.
 */
export function createWeatherTool(opts: {
  client: HttpClient;
  timeoutMs: number;
  limiter: RateLimiter;
  calls: CallRecord[];
  signal: AbortSignal;
}) {
  return createTool({
    id: 'get-current-weather',
    description: `Gets the current temperature and wind for one city from Open-Meteo. Supported cities: ${CITY_NAMES.join(', ')}.`,
    inputSchema: z.object({ city: z.enum(CITY_NAMES) }),
    outputSchema: WeatherResultSchema,
    execute: async ({ city }): Promise<WeatherResult> => {
      const url = forecastUrl(city);
      const started = Date.now();
      const record = (status: number | null, outcome: string) =>
        opts.calls.push({
          url: url.toString(),
          host: url.host,
          allowed: ALLOWED_HOSTS.has(url.host),
          status,
          durationMs: Date.now() - started,
          outcome,
        });

      if (!ALLOWED_HOSTS.has(url.host)) {
        record(null, 'NOT_ALLOWED');
        return { ok: false, city, code: 'NOT_ALLOWED', message: `Host ${url.host} is not on the allowlist.`, retryable: false };
      }
      const slot = opts.limiter.tryAcquire();
      if (!slot.ok) {
        record(null, 'RATE_LIMITED');
        return {
          ok: false,
          city,
          code: 'RATE_LIMITED',
          message: 'Local rate limit reached for the weather API.',
          retryable: true,
          retryAfterSeconds: Math.ceil(slot.retryAfterMs / 1000),
        };
      }

      const timeout = AbortSignal.timeout(opts.timeoutMs);
      try {
        const res = await opts.client.get(url, AbortSignal.any([opts.signal, timeout]));
        if (res.status === 429) {
          record(429, 'RATE_LIMITED');
          const ra = Number(res.headers['retry-after']);
          return {
            ok: false,
            city,
            code: 'RATE_LIMITED',
            message: 'The weather service is rate limiting us.',
            retryable: true,
            ...(Number.isFinite(ra) ? { retryAfterSeconds: ra } : {}),
          };
        }
        if (res.status >= 500) {
          record(res.status, 'UPSTREAM_ERROR');
          return {
            ok: false,
            city,
            code: 'UPSTREAM_ERROR',
            message: `The weather service failed (HTTP ${res.status}).`,
            retryable: true,
          };
        }
        if (res.status !== 200) {
          record(res.status, 'UPSTREAM_ERROR');
          return {
            ok: false,
            city,
            code: 'UPSTREAM_ERROR',
            message: `Unexpected HTTP ${res.status} from the weather service.`,
            retryable: false,
          };
        }
        let json: unknown;
        try {
          json = JSON.parse(res.body);
        } catch {
          record(200, 'BAD_RESPONSE');
          return {
            ok: false,
            city,
            code: 'BAD_RESPONSE',
            message: 'The weather service returned invalid JSON.',
            retryable: false,
          };
        }
        const parsed = ForecastResponseSchema.safeParse(json);
        if (!parsed.success) {
          record(200, 'BAD_RESPONSE');
          return {
            ok: false,
            city,
            code: 'BAD_RESPONSE',
            message: 'The weather response did not have the expected shape.',
            retryable: false,
          };
        }
        record(200, 'ok');
        const c = parsed.data.current;
        return {
          ok: true,
          city,
          temperatureC: c.temperature_2m,
          windKmh: c.wind_speed_10m,
          weatherCode: c.weather_code,
          observedAt: c.time,
          source: opts.client.kind === 'mock' ? 'Open-Meteo (local mock)' : 'Open-Meteo',
        };
      } catch (err) {
        if (opts.signal.aborted) throw err; // the run was cancelled: let the engine report it
        if (timeout.aborted) {
          record(null, 'TIMEOUT');
          return {
            ok: false,
            city,
            code: 'TIMEOUT',
            message: `The weather service did not answer within ${opts.timeoutMs} ms.`,
            retryable: true,
          };
        }
        record(null, 'NETWORK');
        return { ok: false, city, code: 'NETWORK', message: 'Could not reach the weather service.', retryable: true };
      }
    },
  });
}
