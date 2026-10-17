import { describe, expect, it } from 'vitest';
import { emptyProgress, type ExecutionEvent, type ExecutionEventPayload, type InputField } from '@mlp/contracts';
import { SseParser } from '../../lib/sse';
import { applyProgressPatch } from '../../lib/progress-actions';
import { buildInput, initialRawValues, serverDetailsToFieldErrors } from '../../components/workspace/form-model';
import { scoreQuiz } from '../../components/workspace/QuizPanel';
import { initialRunState, runReducer } from './run-state';

let seq = 0;
const ev = (p: ExecutionEventPayload): ExecutionEvent =>
  ({ ...p, runId: 'r', correlationId: 'c', seq: seq++, timestamp: new Date().toISOString() }) as ExecutionEvent;

describe('SseParser', () => {
  it('parses frames split across chunks and ignores comments', () => {
    const p = new SseParser();
    expect(p.push(': ping\n\nid: 1\nevent: tok')).toEqual([]);
    expect(p.push('en\ndata: {"a":1}\n\n')).toEqual([{ id: '1', event: 'token', data: '{"a":1}' }]);
  });
  it('joins multi-line data and handles CRLF', () => {
    expect(new SseParser().push('data: a\r\ndata: b\r\n\r\n')).toEqual([{ data: 'a\nb' }]);
  });
});

describe('runReducer', () => {
  it('accumulates tokens, pairs tool calls, tracks steps and terminal status', () => {
    seq = 0;
    let s = runReducer(initialRunState, { type: 'start' });
    s = runReducer(s, { type: 'started', runId: 'r', correlationId: 'c' });
    const events: ExecutionEventPayload[] = [
      { type: 'workflow-step', stepId: 'a', status: 'running' },
      { type: 'tool-start', toolCallId: 't1', toolName: 'calc', args: { x: 1 } },
      { type: 'tool-finish', toolCallId: 't1', toolName: 'calc', status: 'success', result: 2, durationMs: 3 },
      { type: 'workflow-step', stepId: 'a', status: 'success', output: { ok: true } },
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'result', output: { y: 2 }, validation: { passed: true, checks: [] } },
      { type: 'complete', status: 'succeeded', durationMs: 10 },
    ];
    for (const e of events) s = runReducer(s, { type: 'event', event: ev(e) });
    expect(s.tokenText).toBe('Hello');
    expect(s.tokenCount).toBe(2);
    expect(s.tools).toEqual([
      { toolCallId: 't1', toolName: 'calc', args: { x: 1 }, status: 'success', result: 2, error: undefined, durationMs: 3 },
    ]);
    expect(s.steps).toEqual([{ stepId: 'a', status: 'success', output: { ok: true }, durationMs: undefined }]);
    expect(s).toMatchObject({ phase: 'finished', terminal: 'succeeded', output: { y: 2 } });
  });

  it('ignores replayed events after reconnect', () => {
    seq = 0;
    const e = ev({ type: 'token', text: 'x' });
    let s = runReducer(initialRunState, { type: 'event', event: e });
    s = runReducer(s, { type: 'event', event: e });
    expect(s.tokenText).toBe('x');
  });

  it('records error then cancelled completion', () => {
    seq = 0;
    let s = runReducer(initialRunState, {
      type: 'event',
      event: ev({ type: 'error', code: 'CANCELLED', message: 'stop', retryable: false }),
    });
    s = runReducer(s, { type: 'event', event: ev({ type: 'complete', status: 'cancelled', durationMs: 1 }) });
    expect(s).toMatchObject({ terminal: 'cancelled', error: { code: 'CANCELLED' } });
  });
});

describe('form model', () => {
  const fields: InputField[] = [
    { kind: 'text', name: 'msg', label: 'Msg', required: true, maxLength: 5, minLength: 1 },
    { kind: 'number', name: 'n', label: 'N', required: true, min: 0, max: 10 },
    { kind: 'json', name: 'cfg', label: 'Cfg', required: false, maxBytes: 100 },
    { kind: 'boolean', name: 'flag', label: 'Flag', required: false },
    { kind: 'select', name: 'tone', label: 'Tone', required: true, options: [{ value: 'a', label: 'A' }] },
  ];

  it('initialises from the example input and builds typed values', () => {
    const raw = initialRawValues(fields, { msg: 'hi', n: 3, cfg: { a: 1 }, flag: true, tone: 'a' });
    expect(buildInput(fields, raw)).toEqual({ values: { msg: 'hi', n: 3, cfg: { a: 1 }, flag: true, tone: 'a' }, errors: {} });
  });

  it('reports field-specific errors', () => {
    const { errors } = buildInput(fields, { msg: '', n: '42', cfg: '{bad', flag: false, tone: 'z' });
    expect(errors).toEqual({
      msg: 'This field is required.',
      n: 'Enter a value between 0 and 10.',
      cfg: 'This is not valid JSON.',
      tone: 'Choose one of the options.',
    });
  });

  it('maps server detail paths to fields', () => {
    const r = serverDetailsToFieldErrors(
      [
        { path: 'input.msg', message: 'Too short' },
        { path: 'mode', message: 'bad' },
      ],
      fields,
    );
    expect(r).toEqual({ errors: { msg: 'Too short' }, other: ['mode: bad'] });
  });
});

describe('quiz scoring and progress', () => {
  const q = (id: string, correctIndex: number) => ({ id, prompt: 'p', choices: ['a', 'b'], correctIndex, explanation: 'e' });
  it('passes at 70%', () => {
    const qs = [q('1', 0), q('2', 0), q('3', 0), q('4', 0)];
    expect(scoreQuiz(qs, { 1: 0, 2: 0, 3: 0, 4: 1 })).toEqual({ score: 3, total: 4, passed: true });
    expect(scoreQuiz(qs, { 1: 0, 2: 0, 3: 1, 4: 1 })).toEqual({ score: 2, total: 4, passed: false });
  });

  it('completes only with lesson, passing run and passed quiz', () => {
    let r = applyProgressPatch(undefined, 'lab-00', { lessonRead: true });
    expect(r.status).toBe('in-progress');
    r = applyProgressPatch(r, 'lab-00', { runSucceeded: true, checksPassed: true });
    expect(r.status).toBe('in-progress');
    r = applyProgressPatch(r, 'lab-00', { quiz: { score: 4, total: 4, passed: true, attempts: 1, answers: {} } });
    expect(r.status).toBe('completed');
    expect(applyProgressPatch(emptyProgress('lab-00'), 'lab-00', {}).status).toBe('not-started');
  });
});

describe('runReducer approvals', () => {
  it('tracks pending approvals until resolved', async () => {
    const { pendingApprovals } = await import('./run-state');
    seq = 100;
    let s = runReducer(initialRunState, { type: 'started', runId: 'r', correlationId: 'c' });
    s = runReducer(s, {
      type: 'event',
      event: ev({
        type: 'approval-request',
        approvalId: 'a1',
        toolName: 'issueRefund',
        args: { amountCents: 4500 },
        message: 'Refund €45.00',
        expiresAt: new Date().toISOString(),
      }),
    });
    expect(pendingApprovals(s).map((a) => a.approvalId)).toEqual(['a1']);
    s = runReducer(s, {
      type: 'event',
      event: ev({ type: 'approval-resolved', approvalId: 'a1', decision: 'decline', by: 'timeout' }),
    });
    expect(pendingApprovals(s)).toEqual([]);
    expect(s.approvals[0]).toMatchObject({ status: 'decline', by: 'timeout' });
  });
});

describe('conditional visibility (visibleWhen)', () => {
  const fields = [
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      required: true,
      options: [
        { value: 'reasoner', label: 'R' },
        { value: 'classic', label: 'C' },
      ],
    },
    {
      kind: 'select',
      name: 'temperature',
      label: 'T',
      required: true,
      visibleWhen: { field: 'modelId', in: ['classic'] },
      options: [{ value: '0.3', label: '0.3' }],
    },
    {
      kind: 'select',
      name: 'effort',
      label: 'E',
      required: true,
      options: [
        { value: 'minimal', label: 'minimal', visibleWhen: { field: 'modelId', in: ['reasoner'] } },
        { value: 'default', label: 'default' },
      ],
    },
  ] as InputField[];

  it('hides fields and options and does not submit hidden fields', async () => {
    const { isVisible, visibleOptions, reconcile } = await import('../../components/workspace/form-model');
    const raw = { modelId: 'reasoner', temperature: '0.3', effort: 'minimal' };
    expect(isVisible(fields[1]!, raw)).toBe(false);
    expect(buildInput(fields, raw)).toEqual({ values: { modelId: 'reasoner', effort: 'minimal' }, errors: {} });
    const classic = reconcile(fields, { ...raw, modelId: 'classic' });
    expect(visibleOptions(fields[2] as Extract<InputField, { kind: 'select' }>, classic).map((o) => o.value)).toEqual([
      'default',
    ]);
    expect(classic.effort).toBe('default'); // the hidden option was replaced by the first visible one
    expect(buildInput(fields, classic).values).toEqual({ modelId: 'classic', temperature: '0.3', effort: 'default' });
  });

  it('rejects a hidden option even if forced into the raw state', () => {
    expect(buildInput(fields, { modelId: 'classic', temperature: '0.3', effort: 'minimal' }).errors).toEqual({
      effort: 'Choose one of the options.',
    });
  });
});
