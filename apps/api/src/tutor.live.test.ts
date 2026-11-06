import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createModelService } from '@mlp/labs';
import { lab01Definition } from '../../../packages/labs/src/lab-01/definition';
import { loadDotEnv } from './config.js';
import { createTutorProvider } from './tutor.js';

const enabled = process.env.RUN_TUTOR_LIVE_TESTS === '1';
const evidence: { provider: string; modelId: string; answerChars: number; durationMs: number; status: 'passed' }[] = [];
describe.skipIf(!enabled)('paid tutor provider acceptance (explicit opt-in)', () => {
  beforeAll(() => {
    loadDotEnv();
  });
  it.each(['openai', 'anthropic'])(
    'streams a real %s lesson tutor answer without tools',
    async (provider) => {
      const models = createModelService(process.env);
      const model =
        models.liveModels.find((m) => m.configured && m.provider === provider && m.id === 'openai/gpt-4o-mini') ??
        models.liveModels.find((m) => m.configured && m.provider === provider);
      expect(model, `Configure an enabled ${provider} model and server API key`).toBeDefined();
      let answer = '';
      const start = Date.now();
      await createTutorProvider(models)({
        lesson: lab01Definition,
        request: {
          labId: 'lab-01',
          mode: 'live',
          modelId: model!.id,
          question: 'In two brief sentences, explain the main learning objective of this lesson. Do not include code.',
        },
        signal: AbortSignal.timeout(60_000),
        emitText: (text) => {
          answer += text;
        },
      });
      expect(answer.trim().length).toBeGreaterThan(20);
      evidence.push({
        provider,
        modelId: model!.id,
        answerChars: answer.length,
        durationMs: Date.now() - start,
        status: 'passed',
      });
      mkdirSync('.data', { recursive: true });
      writeFileSync(
        '.data/tutor-live-smoke.json',
        JSON.stringify({ completedAt: new Date().toISOString(), chargeableCalls: evidence.length, results: evidence }, null, 2),
      );
    },
    70_000,
  );
});
