import { describe, expect, it } from 'vitest';
import { sanitizeMastraLog } from './agent-kit.js';

const MASTRA_ERROR = [
  'Error executing step workflow.triage-agent-input-processor.step.processor:support-policy: Error: Not allowed.',
  '    at abort (file:///C:/00.%20IMPORTANTE%20-%20Mastra/app/node_modules/@mastra/core/dist/agent-Blan8B5o.js:6396:11)',
  '    at reject (C:/00. IMPORTANTE - Mastra/app/packages/labs/src/lab-20/processors.ts:46:9)',
].join('\n');

describe('sanitizeMastraLog', () => {
  it('drops stack frames and keeps only the first line', () => {
    expect(sanitizeMastraLog(MASTRA_ERROR)).toBe(
      'Error executing step workflow.triage-agent-input-processor.step.processor:support-policy: Error: Not allowed.',
    );
  });

  it('replaces absolute paths and file URLs with the file name', () => {
    expect(sanitizeMastraLog('failed in file:///C:/srv/app/node_modules/x/dist/agent-1.js:10:2 now')).toBe(
      'failed in agent-1.js now',
    );
    expect(sanitizeMastraLog('cannot read /home/me/app/src/run.ts:12:3')).toBe('cannot read run.ts');
    expect(sanitizeMastraLog('C:\\Users\\me\\app\\src\\run.ts failed')).toBe('run.ts failed');
  });

  it('bounds the length', () => {
    expect(sanitizeMastraLog('x'.repeat(1000))).toHaveLength(300);
  });
});
