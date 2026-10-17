import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { lab14Definition } from './definition.js';
import { ALLOWED_HOSTS, CITY_NAMES, networkClient, RateLimiter, type City } from './http.js';
import { mockClient, type MockFault } from './mock.js';
import { createWeatherTool, WeatherResultSchema, type CallRecord, type WeatherResult } from './tool.js';

export const Lab14InputSchema = z.object({
  cities: z.array(z.enum(CITY_NAMES)).min(1).max(5),
  dataSource: z.enum(['mock', 'open-meteo']),
  mockFault: z.enum(['none', 'timeout', 'rate-limited', 'server-error', 'bad-json']),
  timeoutMs: z.number().int().min(200).max(10_000),
  maxRequestsPerMinute: z.number().int().min(1).max(20),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab14Input = z.infer<typeof Lab14InputSchema>;

export interface Lab14Output {
  dataSource: 'mock' | 'open-meteo';
  answer: string;
  results: WeatherResult[];
  httpCalls: CallRecord[];
  toolCalls: ToolTrace[];
}

/** Offline model: one weather call per city (parallel), then an answer that explains any failure. */
export function offlineScript(cities: City[]) {
  return (v: PromptView): ScriptedTurn => {
    const results = v.toolResults.filter((r) => r.toolName === 'getWeather').map((r) => r.output as WeatherResult);
    if (results.length === 0) return { toolCalls: cities.map((city) => ({ toolName: 'getWeather', input: { city } })) };
    const lines = results.map((r) =>
      r.ok
        ? `${r.city}: ${r.temperatureC}°C, wind ${r.windKmh} km/h (${r.source}).`
        : `${r.city}: weather unavailable — ${r.message}${r.retryable ? ' Please try again later.' : ''}`,
    );
    return { text: lines.join(' ') };
  };
}

export const lab14: LabImplementation<Lab14Input, Lab14Output, LabServices> = {
  definition: lab14Definition as LabDefinition,
  inputSchema: Lab14InputSchema,

  async run(ctx, input) {
    const client = input.dataSource === 'mock' ? mockClient(input.mockFault as MockFault) : networkClient;
    if (input.dataSource === 'open-meteo')
      ctx.log('info', 'Using the real Open-Meteo API (free, no key; needs internet). Fault injection is ignored.');
    const httpCalls: CallRecord[] = [];
    const weatherTool = createWeatherTool({
      client,
      timeoutMs: input.timeoutMs,
      limiter: new RateLimiter(input.maxRequestsPerMinute, 60_000),
      calls: httpCalls,
      signal: ctx.signal,
    });

    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(input.cities),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'weather-agent',
        name: 'Weather Agent',
        instructions: 'Use getWeather once per city. If a call fails, say so plainly and do not guess the weather.',
        model: resolved.model,
        tools: { getWeather: weatherTool },
      }),
    );

    ctx.emit({
      type: 'workflow-step',
      stepId: 'fetch-weather',
      status: 'running',
      input: { dataSource: input.dataSource, allowlist: [...ALLOWED_HOSTS] },
    });
    const res = await streamAgent(ctx, agent, `What is the weather now in ${input.cities.join(' and ')}?`, { maxSteps: 3 });
    for (const c of httpCalls)
      ctx.log(c.outcome === 'ok' ? 'info' : 'warn', `GET ${c.host} → ${c.status ?? '—'} ${c.outcome} (${c.durationMs} ms)`);
    ctx.emit({ type: 'workflow-step', stepId: 'fetch-weather', status: 'success', output: { httpCalls: httpCalls.length } });

    const results = res.tools
      .filter((t) => t.toolName === 'getWeather' && t.status === 'success')
      .map((t) => t.result as WeatherResult);
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolved.simulated,
        dataSource: input.dataSource,
        timeoutMs: input.timeoutMs,
      },
    });
    return { dataSource: input.dataSource, answer: res.text, results, httpCalls, toolCalls: res.tools };
  },

  validate(out, input) {
    const failed = out.results.filter((r) => !r.ok);
    const timeouts = out.httpCalls.filter((c) => c.outcome === 'TIMEOUT');
    return summarizeChecks([
      {
        id: 'allowlisted',
        label: 'Every request went to an allowlisted host',
        passed: out.httpCalls.length > 0 && out.httpCalls.every((c) => c.allowed),
        message: [...new Set(out.httpCalls.map((c) => c.host))].join(', '),
      },
      {
        id: 'typed-results',
        label: 'Every tool result (success or failure) matches the result schema',
        passed: out.results.length > 0 && out.results.every((r) => WeatherResultSchema.safeParse(r).success),
      },
      {
        id: 'failures-handled',
        label: 'Failures became typed errors and the answer explains them',
        passed: failed.every((f) => out.answer.includes(f.city) && /unavailable|could not|couldn|failed|error/i.test(out.answer)),
        message: failed.length ? failed.map((f) => `${f.city}: ${f.code}`).join(', ') : 'no failures',
      },
      {
        id: 'timeout-enforced',
        label: 'Slow requests were cut off at the timeout',
        passed: timeouts.every((t) => t.durationMs < input.timeoutMs + 1000),
        message: timeouts.length ? timeouts.map((t) => `${t.durationMs} ms`).join(', ') : 'no timeouts',
      },
      {
        id: 'mock-offline',
        label: input.dataSource === 'mock' ? 'Mock data source made no network calls' : 'Real API data source used',
        passed: input.dataSource === 'mock' ? out.results.every((r) => !r.ok || r.source.includes('mock')) : true,
      },
    ]);
  },
};
