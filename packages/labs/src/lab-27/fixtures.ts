import type { LabFixture } from '../fixtures.js';
import { lab27Definition } from './definition.js';

const example = lab27Definition.exampleInput;

export const lab27Fixtures: LabFixture[] = [
  {
    name: 'broken enrich: render rejects its input',
    input: { ...example, brokenEnrich: true },
    expect: { status: 'succeeded', validationPassed: false, output: { status: 'failed', rendered: null } },
  },
  {
    name: 'Tokyo in winter: UTC shifts by nine hours',
    input: { ...example, invitation: 'Product launch on 2026-12-03 at 09:30 in Tokyo, room Sakura, organiser Kenji.' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { rendered: { headline: 'Product launch — Thursday 2026-12-03, 09:30 Asia/Tokyo (00:30 UTC)' } },
    },
  },
  {
    name: 'New York after the DST change, unknown room',
    input: { ...example, invitation: 'Board review on 2026-11-02 at 14:00 in New York, room Empire, organiser Lee.' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { rendered: { headline: 'Board review — Monday 2026-11-02, 14:00 America/New_York (19:00 UTC)' } },
    },
  },
];
