import { HANDBOOK_MD } from './samples.js';
import type { LabFixture } from '../fixtures.js';
import { lab36Definition } from './definition.js';

const example = lab36Definition.exampleInput;
const md = Buffer.from(HANDBOOK_MD).toString('base64');

export const lab36Fixtures: LabFixture[] = [
  {
    name: 'valid fixtures only: all ingested',
    input: { ...example, samples: 'valid' },
    expect: { status: 'succeeded', validationPassed: true, output: { summary: { ingested: 3, rejected: 0 } } },
  },
  {
    name: 'an upload that duplicates a fixture is marked duplicate',
    input: { ...example, samples: 'valid', files: [{ name: 'copy-of-handbook.md', type: '', size: HANDBOOK_MD.length, dataBase64: md }] },
    expect: { status: 'succeeded', validationPassed: true, output: { summary: { ingested: 3, duplicates: 1 } } },
  },
  {
    name: 'an upload with invalid base64 is rejected, not crashed',
    input: { ...example, samples: 'none', store: false, files: [{ name: 'x.txt', type: 'text/plain', size: 3, dataBase64: '@@@=' }] },
    expect: { status: 'succeeded', validationPassed: true, output: { summary: { rejected: 1, byCode: { INVALID_ENCODING: 1 } } } },
  },
];
