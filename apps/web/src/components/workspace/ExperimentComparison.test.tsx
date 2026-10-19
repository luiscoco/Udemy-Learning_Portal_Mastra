import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComparisonMetrics, ExperimentComparison as Data } from '@mlp/contracts';
import { comparisonOf, ExperimentComparison } from './ExperimentComparison';

const metrics = (passRate: number, total: number | null): ComparisonMetrics => ({
  total: 4,
  passed: passRate * 4,
  passRate,
  meanScore: 0.8,
  scorable: 3,
  tokens: { input: null, output: null, total, source: 'simulated' },
  latencyMs: { p50: 20, p95: 40, mean: 25 },
  cost: { value: null, unit: null, source: null, note: 'Not reported by the provider.' },
});
const data: Data = {
  datasetId: 'course-faq',
  datasetVersion: 5,
  baselineConfigId: 'grounded',
  configs: [
    {
      id: 'grounded',
      label: 'Grounded',
      experimentId: 'e1',
      modelId: 'm',
      provider: 'offline-sim',
      simulated: true,
      tools: ['search_sources'],
      metrics: metrics(0.75, 500),
      deltas: null,
    },
    {
      id: 'no-tools',
      label: 'No tools',
      experimentId: 'e2',
      modelId: 'm',
      provider: 'offline-sim',
      simulated: true,
      tools: [],
      metrics: metrics(0.25, 200),
      deltas: { passRate: -0.5, meanScore: 0, tokensTotal: -300, latencyP50: 0, regressions: 2, improvements: 0 },
    },
  ],
  items: [
    {
      externalId: 'workflow-steps',
      title: 'Workflow steps',
      results: { grounded: { passed: true, score: 0.8 }, 'no-tools': { passed: false, score: 0.4 } },
      changes: { 'no-tools': 'regression' },
    },
  ],
  notes: ['Cost: not reported by the provider.'],
  export: {
    json: '{"schema":"mlp.experiment-comparison/1"}',
    csv: 'config,pass_rate\r\ngrounded,0.75\r\n',
    filename: 'experiment-comparison-v5',
  },
};

afterEach(() => vi.restoreAllMocks());

describe('ExperimentComparison', () => {
  it('only accepts outputs that match the contract', () => {
    expect(comparisonOf({ comparison: data })).toEqual(data);
    expect(comparisonOf({ comparison: { configs: [] } })).toBeNull();
    expect(comparisonOf(undefined)).toBeNull();
  });

  it('shows metrics with deltas, regressions and an unreported cost', () => {
    render(<ExperimentComparison data={data} />);
    const metricsTable = screen.getByRole('table', { name: /Metrics per configuration/ });
    const row = within(metricsTable).getByRole('row', { name: /No tools/ });
    expect(row).toHaveTextContent('0.25 (−0.5)');
    expect(row).toHaveTextContent('200 (−300)');
    expect(row).toHaveTextContent('not reported');
    const scenarios = screen.getByRole('table', { name: /Outcome of each scenario/ });
    expect(within(scenarios).getByRole('row', { name: /Workflow steps/ })).toHaveTextContent('regression');
  });

  it('downloads the CSV export without a network request', async () => {
    const user = userEvent.setup();
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => ((blob = b), 'blob:test'));
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ExperimentComparison data={data} />);
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(await blob!.text()).toBe(data.export.csv);
  });
});
