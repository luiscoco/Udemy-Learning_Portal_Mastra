import type { LabFixture } from '../fixtures.js';
import { lab50Definition } from './definition.js';

const example = lab50Definition.exampleInput;
const servers = 'Which servers are available?';

export const lab50Fixtures: LabFixture[] = [
  {
    name: 'calculator offline: the data tool still runs and the gap is reported',
    input: { ...example, downServer: 'calc' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        servers: [
          { key: 'calc', status: 'failed', error: { category: 'unreachable' } },
          { key: 'data', status: 'connected' },
        ],
        serverExecutions: { calc: {}, data: { lab_title: 1 } },
      },
    },
  },
  {
    name: 'data server offline: the calculation still runs',
    input: { ...example, downServer: 'data' },
    expect: { status: 'succeeded', validationPassed: true, output: { serverExecutions: { calc: { percent_of: 1 }, data: {} } } },
  },
  {
    name: 'first-wins: data.info is shadowed',
    input: { ...example, question: servers, collisionPolicy: 'first-wins' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        serverExecutions: { calc: { info: 1 }, data: {} },
        answer: 'Calculator server: Arithmetic: add, multiply, percent_of.',
      },
    },
  },
  {
    name: 'reject: the shared name is excluded on both servers',
    input: { ...example, question: servers, collisionPolicy: 'reject' },
    expect: { status: 'succeeded', validationPassed: true, output: { serverExecutions: { calc: {}, data: {} } } },
  },
  {
    name: 'namespace: both info tools run, each on its own server',
    input: { ...example, question: servers },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { serverExecutions: { calc: { info: 1 }, data: { info: 1 } } },
    },
  },
];
