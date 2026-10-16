import { describe, expect, it } from 'vitest';
import { getMastraVersion } from './index.js';

describe('getMastraVersion', () => {
  it('reads the installed semver of @mastra/core', () => {
    expect(getMastraVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
