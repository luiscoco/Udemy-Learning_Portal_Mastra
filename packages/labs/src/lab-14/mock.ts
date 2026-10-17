import type { City, HttpClient, HttpResponse } from './http.js';
import { CITIES } from './http.js';

/** Recorded from the real Open-Meteo API (2026-10-17) and reused for every city with fixed values. */
const FIXTURES: Record<City, { temperature_2m: number; wind_speed_10m: number; weather_code: number }> = {
  Madrid: { temperature_2m: 19.1, wind_speed_10m: 13.2, weather_code: 3 },
  Lisbon: { temperature_2m: 21.4, wind_speed_10m: 18.0, weather_code: 1 },
  London: { temperature_2m: 12.7, wind_speed_10m: 22.5, weather_code: 61 },
  Tokyo: { temperature_2m: 17.9, wind_speed_10m: 7.4, weather_code: 0 },
  'New York': { temperature_2m: 14.3, wind_speed_10m: 16.1, weather_code: 2 },
};

export type MockFault = 'none' | 'timeout' | 'rate-limited' | 'server-error' | 'bad-json';

function cityFor(url: URL): City | undefined {
  const lat = Number(url.searchParams.get('latitude'));
  return (Object.keys(CITIES) as City[]).find((c) => CITIES[c].latitude === lat);
}

/** A local stand-in for Open-Meteo: no network, deterministic, with injectable faults. */
export function mockClient(fault: MockFault): HttpClient {
  return {
    kind: 'mock',
    async get(url, signal): Promise<HttpResponse> {
      if (fault === 'timeout') {
        // Hang until the caller's timeout aborts the request.
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      }
      if (fault === 'rate-limited')
        return { status: 429, headers: { 'retry-after': '30' }, body: '{"error":true,"reason":"Too many requests"}' };
      if (fault === 'server-error')
        return { status: 503, headers: {}, body: '{"error":true,"reason":"The service is overloaded"}' };
      if (fault === 'bad-json')
        return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"current": {"temperature_2m": "warm"' };
      const city = cityFor(url);
      if (!city) return { status: 400, headers: {}, body: '{"error":true,"reason":"Unknown coordinates"}' };
      const f = FIXTURES[city];
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          latitude: CITIES[city].latitude,
          longitude: CITIES[city].longitude,
          current_units: {
            time: 'iso8601',
            interval: 'seconds',
            temperature_2m: '°C',
            wind_speed_10m: 'km/h',
            weather_code: 'wmo code',
          },
          current: { time: '2026-10-17T10:15', interval: 900, ...f },
        }),
      };
    },
  };
}
