import type { LabFixture } from '../fixtures.js';
import { lab47Definition } from './definition.js';

const example = lab47Definition.exampleInput;

export const lab47Fixtures: LabFixture[] = [
  {
    name: 'unknown tool: rejected before anything is sent',
    input: { ...example, toolName: 'delete_everything', args: {} },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { status: 'rejected', reason: 'unknown-tool' } }, serverCalls: {} },
    },
  },
  {
    name: 'destructive tool not on the allowlist',
    input: { ...example, toolName: 'reset_progress', args: { learnerId: 'me' } },
    expect: { status: 'succeeded', validationPassed: true, output: { mcpCatalog: { call: { reason: 'not-allowlisted' } } } },
  },
  {
    name: 'destructive tool allowlisted: still not read-only',
    input: {
      ...example,
      toolName: 'reset_progress',
      args: { learnerId: 'me' },
      allowlist: [...example.allowlist, 'reset_progress'],
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { reason: 'not-read-only' } }, serverCalls: {} },
    },
  },
  {
    name: 'invalid arguments: field errors, no server call',
    input: { ...example, args: { query: 'm' } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { reason: 'invalid-arguments', fieldErrors: [{ field: 'query' }] } }, serverCalls: {} },
    },
  },
  {
    name: 'namespaced key resolves to the server tool name',
    input: { ...example, toolName: 'course_lab_title', args: { number: 23 } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { toolName: 'lab_title', result: { number: 23, title: 'Working memory' } } } },
    },
  },
];
