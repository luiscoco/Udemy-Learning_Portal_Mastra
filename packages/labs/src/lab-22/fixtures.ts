import type { LabFixture } from '../fixtures.js';
import { lab22Definition } from './definition.js';

export const lab22Fixtures: LabFixture[] = [
  {
    name: 'raw Mastra calls let bob read and delete alice’s thread',
    input: { ...lab22Definition.exampleInput, strategy: 'raw-mastra' },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: {
        steps: [
          {},
          {},
          {},
          {},
          {},
          { step: 6, as: 'bob', op: 'history', result: { ok: true, data: { thread: { title: 'Porto trip' } } } },
          { step: 7, as: 'bob', op: 'send', result: { ok: false, code: 'ERROR' } },
          { step: 8, as: 'bob', op: 'reset', result: { ok: true } },
          { step: 9, as: 'bob', op: 'delete', result: { ok: true } },
          {},
          { step: 11, as: 'alice', op: 'history', result: { ok: false, code: 'NOT_FOUND' } },
          {},
          { step: 13, as: 'alice', op: 'list', result: { ok: true, data: [] } },
        ],
        threads: [
          { ref: '$1', exists: false },
          { ref: '$2', exists: true },
        ],
      },
    },
  },
  {
    name: 'carol sees nothing and cannot reach others',
    input: {
      operations: [
        { as: 'alice', op: 'create', title: 'Alice' },
        { as: 'carol', op: 'list' },
        { as: 'carol', op: 'send', thread: '$1', text: 'hello?' },
      ],
      strategy: 'guarded',
      modelId: 'openai/gpt-5-mini',
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        steps: [{}, { result: { ok: true, data: [] } }, { result: { ok: false, code: 'NOT_FOUND' } }],
        threads: [{ ref: '$1', owner: 'alice', exists: true, userMessages: [] }],
      },
    },
  },
];
