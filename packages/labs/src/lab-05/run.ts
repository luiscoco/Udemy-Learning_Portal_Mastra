import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation, type RunContext } from '@mlp/lab-engine';
import { labSourceDir } from '../paths.js';
import { lab05Definition } from './definition.js';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const StudioUrlSchema = z
  .string()
  .trim()
  .max(100)
  .superRefine((raw, ctx) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a full URL such as http://localhost:4111' });
      return;
    }
    if (url.protocol !== 'http:') ctx.addIssue({ code: 'custom', message: 'Local Studio uses http://' });
    if (!LOOPBACK.has(url.hostname)) {
      ctx.addIssue({ code: 'custom', message: 'Only your own machine (localhost / 127.0.0.1) can be probed' });
    }
    const port = Number(url.port || '80');
    if (port < 1024 || port > 65535)
      ctx.addIssue({ code: 'custom', message: 'Use a port between 1024 and 65535 (Studio defaults to 4111)' });
    if (url.pathname !== '/' || url.search || url.hash)
      ctx.addIssue({ code: 'custom', message: 'Give only the origin, without a path' });
  });

export const Lab05InputSchema = z.object({
  target: z.enum(['recorded', 'local']),
  studioUrl: StudioUrlSchema,
  agentId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, 'Agent ids are kebab-case'),
});
export type Lab05Input = z.infer<typeof Lab05InputSchema>;

interface AgentSummary {
  id: string;
  name: string;
  provider?: string;
  modelId?: string;
  instructions?: string;
  tools: string[];
}

export interface Lab05Output {
  target: 'recorded' | 'local';
  studioUrl: string;
  launchLink: string;
  reachable: boolean;
  studioUiDetected: boolean | null;
  hint?: string;
  agents: AgentSummary[];
  agent: AgentSummary | null;
  comparison: { aspect: string; studio: string; lms: string }[];
}

const COMPARISON: Lab05Output['comparison'] = [
  { aspect: 'Purpose', studio: 'Developer inspector for your own Mastra project', lms: 'Guided lessons with automated checks' },
  { aspect: 'Runs where', studio: 'Your machine via `mastra dev` (port 4111)', lms: 'This platform’s API server' },
  {
    aspect: 'Shows',
    studio: 'Agents, tools, workflows, chat, traces and evals',
    lms: 'Curated events, checks, quiz and progress',
  },
  { aspect: 'Access', studio: 'Full, privileged access to your project and keys', lms: 'Only the labs’ server-side code' },
  { aspect: 'How to open', studio: 'In its own browser tab — never embedded', lms: 'This web app' },
];

type RawAgents = Record<
  string,
  { id?: string; name?: string; provider?: string; modelId?: string; instructions?: string; tools?: Record<string, unknown> }
>;

function summarize(raw: RawAgents): AgentSummary[] {
  return Object.entries(raw).map(([key, a]) => ({
    id: a.id ?? key,
    name: a.name ?? key,
    provider: a.provider,
    modelId: a.modelId,
    instructions: a.instructions,
    tools: Object.keys(a.tools ?? {}),
  }));
}

async function httpGet(
  ctx: RunContext,
  url: string,
  callId: string,
): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  ctx.emit({ type: 'tool-start', toolCallId: callId, toolName: 'http.get', args: { url } });
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(3000)]), redirect: 'error' });
    const body = (await res.text()).slice(0, 200_000);
    ctx.emit({
      type: 'tool-finish',
      toolCallId: callId,
      toolName: 'http.get',
      status: 'success',
      result: { status: res.status, bytes: body.length },
      durationMs: Date.now() - started,
    });
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    ctx.throwIfAborted();
    const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
    ctx.emit({
      type: 'tool-finish',
      toolCallId: callId,
      toolName: 'http.get',
      status: 'error',
      error: code,
      durationMs: Date.now() - started,
    });
    return { ok: false, error: code };
  }
}

export const lab05: LabImplementation<Lab05Input, Lab05Output> = {
  definition: lab05Definition as LabDefinition,
  inputSchema: Lab05InputSchema,

  async run(ctx, input) {
    const origin = new URL(input.studioUrl).origin;
    let rawAgents: RawAgents = {};
    let reachable = false;
    let studioUiDetected: boolean | null = null;
    let hint: string | undefined;

    ctx.emit({ type: 'workflow-step', stepId: 'probe-studio', status: 'running', input: { target: input.target, origin } });
    if (input.target === 'recorded') {
      const file = JSON.parse(await readFile(join(labSourceDir('lab-05'), 'recorded-agents.json'), 'utf8')) as {
        recordedWith: string;
        response: RawAgents;
      };
      ctx.log(
        'info',
        `Using a recorded GET /api/agents response (${file.recordedWith}). Switch target to "local" after running npm run studio.`,
      );
      rawAgents = file.response;
      reachable = true;
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new LabError(
          'NOT_CONFIGURED',
          'Probing a local Studio is disabled on production servers. Use the recorded target.',
        );
      }
      const ui = await httpGet(ctx, `${origin}/`, 'probe-ui');
      studioUiDetected = Boolean(ui.ok && ui.body?.includes('<title>Mastra Studio</title>'));
      const api = await httpGet(ctx, `${origin}/api/agents`, 'probe-agents');
      if (api.ok && api.body) {
        try {
          rawAgents = JSON.parse(api.body) as RawAgents;
          reachable = true;
        } catch {
          hint = `${origin}/api/agents did not return JSON — is this really a Mastra dev server?`;
        }
      } else {
        hint =
          api.error === 'ECONNREFUSED'
            ? `Nothing is listening on ${origin}. Start Studio with "npm run studio" (repo root) or "npx mastra dev" in your project, then run again.`
            : `Studio did not answer (${api.status ?? api.error}). Check the URL and that mastra dev is running.`;
      }
      ctx.log(reachable ? 'info' : 'warn', reachable ? `Studio answered at ${origin}` : hint!);
    }
    ctx.emit({ type: 'workflow-step', stepId: 'probe-studio', status: reachable ? 'success' : 'failed' });

    ctx.emit({ type: 'workflow-step', stepId: 'inspect-agent', status: 'running', input: { agentId: input.agentId } });
    const agents = summarize(rawAgents);
    const agent = agents.find((a) => a.id === input.agentId) ?? null;
    if (reachable) {
      ctx.log(
        agent ? 'info' : 'warn',
        agent
          ? `Found ${agent.id}: ${agent.provider}/${agent.modelId}`
          : `No agent with id "${input.agentId}". Registered: ${agents.map((a) => a.id).join(', ') || 'none'}`,
      );
    }
    ctx.emit({ type: 'workflow-step', stepId: 'inspect-agent', status: agent ? 'success' : 'skipped' });

    return {
      target: input.target,
      studioUrl: origin,
      launchLink: `${origin}/agents/${encodeURIComponent(input.agentId)}`,
      reachable,
      studioUiDetected,
      ...(hint ? { hint } : {}),
      agents,
      agent,
      comparison: COMPARISON,
    };
  },

  validate(out, input) {
    return summarizeChecks([
      {
        id: 'studio-reachable',
        label: 'Studio API answered',
        passed: out.reachable,
        message: out.hint ?? `${out.target} · ${out.studioUrl}`,
      },
      {
        id: 'agent-found',
        label: `Agent "${input.agentId}" is registered in the Studio project`,
        passed: out.agent !== null,
        message: out.agents.length ? `agents: ${out.agents.map((a) => a.id).join(', ')}` : undefined,
      },
      {
        id: 'agent-config-read',
        label: 'Studio reports the agent’s model and instructions',
        passed: Boolean(out.agent?.modelId && out.agent.provider && out.agent.instructions),
        message: out.agent ? `${out.agent.provider}/${out.agent.modelId}` : undefined,
      },
    ]);
  },
};
