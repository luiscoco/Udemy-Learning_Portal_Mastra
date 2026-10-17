import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';

/**
 * Deterministic offline language model for labs and tests.
 *
 * Implements the AI SDK `LanguageModelV2` specification (accepted by Mastra's `Agent.model`), so the
 * real Mastra agent loop — instructions, tools, streaming, structured output — runs without any
 * network call or API key. Responses come from a `script` function that sees the full prompt.
 */

export interface ScriptedToolCall {
  toolName: string;
  input: unknown;
  toolCallId?: string;
}

export interface ScriptedTurn {
  /** Assistant text for this turn (streamed word by word). */
  text?: string;
  /** Tool calls requested in this turn. The agent executes them and calls the model again. */
  toolCalls?: ScriptedToolCall[];
  finishReason?: LanguageModelV2FinishReason;
  /** Throw this error instead of answering (fault injection). */
  error?: Error;
  /** Wait this long before answering or failing (simulates a slow provider; honours abort). */
  delayMs?: number;
}

export interface PromptView {
  system: string;
  /** Text of the last user message. */
  lastUser: string;
  /** All user texts in order. */
  userMessages: string[];
  /** Tool results already present in the prompt, in order. */
  toolResults: { toolCallId: string; toolName: string; output: unknown }[];
  /** Names of tools offered to the model in this call. */
  toolNames: string[];
  /** Whether a JSON response format was requested (structured output). */
  jsonMode: boolean;
  /** Number of model calls made so far by this model instance (0-based). */
  callIndex: number;
  raw: LanguageModelV2Prompt;
  options: LanguageModelV2CallOptions;
}

export interface ScriptedModelOptions {
  provider?: string;
  modelId?: string;
  script: (view: PromptView) => ScriptedTurn;
  /** Delay between streamed words (ms). Defaults to 0. */
  tokenDelayMs?: number;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p: { type?: string; text?: string }) => (p && p.type === 'text' ? (p.text ?? '') : '')).join('');
  }
  return '';
}

export function viewPrompt(options: LanguageModelV2CallOptions, callIndex: number): PromptView {
  const raw = options.prompt;
  const system = raw
    .filter((m) => m.role === 'system')
    .map((m) => textOf(m.content))
    .join('\n');
  const userMessages = raw.filter((m) => m.role === 'user').map((m) => textOf(m.content));
  const toolResults: PromptView['toolResults'] = [];
  for (const m of raw) {
    if (m.role !== 'tool') continue;
    for (const part of m.content) {
      if (part.type !== 'tool-result') continue;
      const out = part.output as { type: string; value?: unknown };
      toolResults.push({ toolCallId: part.toolCallId, toolName: part.toolName, output: out && 'value' in out ? out.value : out });
    }
  }
  return {
    system,
    lastUser: userMessages[userMessages.length - 1] ?? '',
    userMessages,
    toolResults,
    toolNames: (options.tools ?? []).map((t) => t.name),
    jsonMode: options.responseFormat?.type === 'json',
    callIndex,
    raw,
    options,
  };
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

function usageFor(view: PromptView, text: string): LanguageModelV2Usage {
  const inputTokens = countWords(view.system) + view.userMessages.reduce((n, u) => n + countWords(u), 0);
  const outputTokens = countWords(text);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function abortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error) return reason;
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

export class ScriptedLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls = {};
  /** Every call's prompt view, for assertions and teaching ("what did the model see?"). */
  readonly calls: PromptView[] = [];
  private readonly script: ScriptedModelOptions['script'];
  private readonly tokenDelayMs: number;
  private toolCallCounter = 0;

  constructor(opts: ScriptedModelOptions) {
    this.provider = opts.provider ?? 'mlp-offline';
    this.modelId = opts.modelId ?? 'scripted-v1';
    this.script = opts.script;
    this.tokenDelayMs = opts.tokenDelayMs ?? 0;
  }

  private async turn(options: LanguageModelV2CallOptions): Promise<{ view: PromptView; turn: ScriptedTurn }> {
    const signal = options.abortSignal;
    if (signal?.aborted) throw abortError(signal);
    const view = viewPrompt(options, this.calls.length);
    this.calls.push(view);
    const turn = this.script(view);
    if (turn.delayMs && turn.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, turn.delayMs);
        const onAbort = () => {
          clearTimeout(t);
          reject(abortError(signal));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    if (turn.error) throw turn.error;
    return { view, turn };
  }

  private toolCallContent(turn: ScriptedTurn): Extract<LanguageModelV2Content, { type: 'tool-call' }>[] {
    return (turn.toolCalls ?? []).map((c) => ({
      type: 'tool-call' as const,
      toolCallId: c.toolCallId ?? `call_${++this.toolCallCounter}`,
      toolName: c.toolName,
      input: JSON.stringify(c.input ?? {}),
    }));
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const { view, turn } = await this.turn(options);
    const text = turn.text ?? '';
    const toolCalls = this.toolCallContent(turn);
    const content: LanguageModelV2Content[] = [...(text ? [{ type: 'text' as const, text }] : []), ...toolCalls];
    return {
      content,
      finishReason: turn.finishReason ?? (toolCalls.length > 0 ? 'tool-calls' : 'stop'),
      usage: usageFor(view, text),
      warnings: [],
      request: { body: { modelId: this.modelId } },
      response: { id: `resp_${view.callIndex}`, modelId: this.modelId, timestamp: new Date(0) },
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const { view, turn } = await this.turn(options);
    const text = turn.text ?? '';
    const toolCalls = this.toolCallContent(turn);
    const delay = this.tokenDelayMs;
    const signal = options.abortSignal;
    const words = text.match(/\S+\s*/g) ?? [];
    const finishReason = turn.finishReason ?? (toolCalls.length > 0 ? 'tool-calls' : 'stop');
    const usage = usageFor(view, text);
    const modelId = this.modelId;

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(ctrl) {
        try {
          ctrl.enqueue({ type: 'stream-start', warnings: [] });
          ctrl.enqueue({ type: 'response-metadata', id: `resp_${view.callIndex}`, modelId, timestamp: new Date(0) });
          if (words.length > 0) {
            ctrl.enqueue({ type: 'text-start', id: 'text-1' });
            for (const w of words) {
              if (signal?.aborted) throw abortError(signal);
              if (delay > 0) await new Promise((r) => setTimeout(r, delay));
              ctrl.enqueue({ type: 'text-delta', id: 'text-1', delta: w });
            }
            ctrl.enqueue({ type: 'text-end', id: 'text-1' });
          }
          for (const call of toolCalls) ctrl.enqueue(call);
          ctrl.enqueue({ type: 'finish', finishReason, usage });
          ctrl.close();
        } catch (err) {
          ctrl.error(err);
        }
      },
    });
    return { stream, request: { body: { modelId } }, response: { headers: {} } };
  }
}

/** Convenience: a model that always answers with `text` (no tools). */
export function fixedTextModel(text: string, opts: Omit<ScriptedModelOptions, 'script'> = {}) {
  return new ScriptedLanguageModel({ ...opts, script: () => ({ text }) });
}
