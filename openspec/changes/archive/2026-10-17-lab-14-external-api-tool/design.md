# Design

## Context

Probed the real API: `GET https://api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,wind_speed_10m,weather_code&timezone=UTC` returns `{ current: { time, temperature_2m, wind_speed_10m, weather_code }, current_units: {…} }`; the first probe returned `503 {"error":true,"reason":"The service is overloaded"}`, which the lab reproduces as a fault.

## Decisions

- `HttpClient` interface (mock | network) injected into a tool factory; the mock is keyed by the coordinates the URL builder produces.
- The tool never throws for upstream problems (typed `ok: false` results), except to propagate run cancellation to the engine.
- Rate limiter per run (input-sized) so tests and concurrent learners do not interfere; documents that production would share it per host.
- The real data source is optional and free; offline mode remains network-free by default.
