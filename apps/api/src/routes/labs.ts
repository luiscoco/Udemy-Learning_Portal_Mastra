import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import type { CheckResult, LabSourceResponse, LabSummary, PreflightResult, SourceFile } from '@mlp/contracts';
import { LabError, type LabRegistry, type LabRunner } from '@mlp/lab-engine';
import { resolveLabSourcePath, type LabServices } from '@mlp/labs';
import { getMastraVersion } from '@mlp/mastra-runtime';
import type { AppConfig } from '../config.js';
import { requireAuth } from '../auth.js';

const LANG: Record<string, SourceFile['language']> = { ts: 'typescript', tsx: 'tsx', json: 'json', md: 'markdown' };

export function configuredProviders(config: AppConfig): string[] {
  return [
    config.OPENAI_API_KEY ? 'openai' : null,
    config.ANTHROPIC_API_KEY ? 'anthropic' : null,
    config.GOOGLE_API_KEY || config.GOOGLE_GENERATIVE_AI_API_KEY ? 'google' : null,
  ].filter((p): p is string => p !== null);
}

export function labsRouter(deps: {
  config: AppConfig;
  registry: LabRegistry<LabServices>;
  runner: LabRunner<LabServices>;
  pinned: Record<string, string>;
}): Router {
  const { config, registry, runner, pinned } = deps;
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(
      registry.definitions().map((d): LabSummary => ({
        id: d.id,
        number: d.number,
        title: d.title,
        moduleId: d.moduleId,
        summary: d.summary,
        modes: d.execution.modes,
      })),
    );
  });

  router.get('/:labId', (req, res) => {
    res.json(registry.require(req.params.labId).definition);
  });

  router.get('/:labId/source', async (req, res) => {
    const def = registry.require(req.params.labId).definition;
    const refs = [...def.sourceFiles];
    for (const extra of [def.exercise.starterFile, def.exercise.solutionFile]) {
      if (extra && !refs.some((r) => r.path === extra)) {
        refs.push({ path: extra, title: extra === def.exercise.solutionFile ? 'Exercise solution' : 'Exercise starter' });
      }
    }
    const files: SourceFile[] = [];
    for (const ref of refs) {
      // Paths were validated at registration (no traversal); join keeps them inside the lab folder.
      const code = await readFile(resolveLabSourcePath(def.id, ref.path), 'utf8').catch(() => {
        throw new LabError('NOT_FOUND', `Source file ${ref.path} is missing for ${def.id}`);
      });
      const ext = ref.path.split('.').pop() ?? 'ts';
      files.push({ path: ref.path, title: ref.title, description: ref.description, language: LANG[ext] ?? 'typescript', code });
    }
    const body: LabSourceResponse = { labId: def.id, files, pinned };
    res.json(body);
  });

  router.get('/:labId/preflight', async (req, res) => {
    const lab = registry.require(req.params.labId);
    const def = lab.definition;
    const mastraVersion = getMastraVersion();
    const providers = configuredProviders(config);
    const checks: CheckResult[] = [
      { id: 'lab-registered', label: 'Lab is implemented on this server', passed: true },
      {
        id: 'mastra-installed',
        label: 'Mastra runtime is installed',
        passed: /^\d+\.\d+\.\d+/.test(mastraVersion),
        message: `@mastra/core ${mastraVersion}`,
      },
      {
        id: 'offline-available',
        label: 'Offline (mock) mode available',
        passed: def.execution.modes.includes('offline'),
        message: def.execution.modes.includes('offline') ? 'Runs at zero cost' : 'This lab needs live mode',
      },
    ];
    if (def.execution.modes.includes('live')) {
      checks.push({
        id: 'live-ready',
        label: 'Live mode configured (optional)',
        passed: config.MASTRA_MODE === 'live' && providers.length > 0,
        message:
          config.MASTRA_MODE !== 'live'
            ? 'Server is in offline mode (MASTRA_MODE=offline)'
            : providers.length === 0
              ? 'No provider API key configured'
              : `Providers configured: ${providers.join(', ')}`,
      });
    }
    if (lab.preflight) {
      checks.push(...(await lab.preflight({ serverMode: config.MASTRA_MODE, mastraVersion, configuredProviders: providers })));
    }
    const required = checks.filter((c) => c.id !== 'live-ready');
    const body: PreflightResult = { labId: def.id, ready: required.every((c) => c.passed), checks };
    res.json(body);
  });

  // Running a lab requires a signed-in learner; the run is bound to them (anonymous → 401).
  router.post('/:labId/runs', requireAuth, (req, res) => {
    const snapshot = runner.start(String(req.params.labId), req.body ?? {}, {
      requestId: req.requestId,
      correlationId: req.correlationId,
      ownerId: req.principal!.sub,
    });
    res.status(202).location(`/api/runs/${snapshot.runId}`).json({
      runId: snapshot.runId,
      correlationId: snapshot.correlationId,
      requestId: req.requestId,
      runToken: snapshot.runToken,
    });
  });

  return router;
}
