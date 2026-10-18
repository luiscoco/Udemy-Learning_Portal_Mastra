import type { LabFixture } from '../fixtures.js';
import { lab48Definition } from './definition.js';

const example = lab48Definition.exampleInput;

export const lab48Fixtures: LabFixture[] = [
  {
    name: 'tools-only server: the syllabus falls back to the course_info tool',
    input: { ...example, server: 'tools-only' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCapabilities: { operation: { status: 'fallback', via: 'tool course_info' } } },
    },
  },
  {
    name: 'template URI on the full server: rejected, then the lab_title tool answers',
    input: { ...example, resourceUri: 'course://labs/47' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCapabilities: { operation: { status: 'fallback', via: 'tool lab_title' } } },
    },
  },
  {
    name: 'prompt from the server',
    input: { ...example, operation: 'get-prompt', promptArgs: { number: '23' } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCapabilities: { operation: { status: 'server', via: 'prompts.get' } } },
    },
  },
  {
    name: 'missing required prompt argument: classified error',
    input: { ...example, operation: 'get-prompt', promptArgs: {} },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCapabilities: { operation: { status: 'error', error: { code: 'missing-argument' } } } },
    },
  },
  {
    name: 'tools-only server: local prompt template, labelled',
    input: { ...example, server: 'tools-only', operation: 'get-prompt' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCapabilities: { operation: { status: 'fallback', via: 'local template (not from the server)' } } },
    },
  },
];
