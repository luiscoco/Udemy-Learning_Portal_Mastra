import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QualityDashboard as Data } from '@mlp/contracts';
import { dashboardOf, QualityDashboard } from './QualityDashboard';

const run = (experimentId: string, configId: string, passRate: number) => ({
  experimentId,
  name: `run:${configId}`,
  configId,
  datasetVersion: 5,
  startedAt: '2026-10-19T10:00:00.000Z',
  total: 4,
  passed: passRate * 4,
  passRate,
  errored: 0,
  latency: { p50: 10, p95: 20, p99: 20 },
});
const data: Data = {
  datasetId: 'course-faq',
  datasetVersion: 5,
  window: 10,
  empty: { isEmpty: false, reason: null, message: '', actions: [] },
  kpis: {
    runs: 2,
    latestPassRate: 0.25,
    previousPassRate: 0.75,
    passRateDelta: -0.5,
    latestP50: 10,
    latestP95: 20,
    regressions: 1,
  },
  runs: [run('e1', 'grounded', 0.75), run('e2', 'no-tools', 0.25)],
  regressions: {
    needsTwoRuns: false,
    items: [
      {
        externalId: 'workflow-steps',
        title: 'Workflow steps',
        failedAssertions: ['Mentions “step” (not found)'],
        traceId: 't1',
        previousExperimentId: 'e1',
        latestExperimentId: 'e2',
      },
    ],
  },
  latestItems: [
    {
      externalId: 'workflow-steps',
      title: 'Workflow steps',
      passed: false,
      durationMs: 12,
      failedAssertions: ['Mentions “step” (not found)'],
      traceId: 't1',
      error: null,
    },
    {
      externalId: 'out-of-scope',
      title: 'Out-of-scope question',
      passed: true,
      durationMs: 8,
      failedAssertions: [],
      traceId: null,
      error: null,
    },
  ],
  traces: {
    t1: [
      {
        id: 's1',
        parentId: null,
        traceId: 't1',
        name: "agent run: 'cfg-no-tools'",
        type: 'agent_run',
        entity: 'cfg-no-tools',
        startMs: 0,
        durationMs: 12,
        status: 'ok',
        error: null,
        attributes: {},
        correlationId: 'c1',
      },
    ],
  },
  notes: [],
};

describe('QualityDashboard', () => {
  it('only accepts outputs that match the contract', () => {
    expect(dashboardOf({ dashboard: data })).toEqual(data);
    expect(dashboardOf({ dashboard: { runs: 'x' } })).toBeNull();
    expect(dashboardOf(null)).toBeNull();
  });

  it('shows KPIs, the trend, regressions, and opens a stored trace from its link', async () => {
    const user = userEvent.setup();
    render(<QualityDashboard data={data} />);
    expect(screen.getByRole('region', { name: 'Key indicators' })).toHaveTextContent('Change vs previous run−0.5');
    expect(screen.getByRole('table', { name: /Run history/ })).toHaveTextContent('↓ down');
    expect(screen.getByRole('list', { name: 'Regressed scenarios' })).toHaveTextContent('Mentions “step” (not found)');
    expect(within(screen.getByRole('list', { name: 'Latest scenarios' })).getByText('trace not recorded')).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('list', { name: 'Regressed scenarios' })).getByRole('button', {
        name: 'Open trace of Workflow steps',
      }),
    );
    expect(screen.getByTestId('span-tree')).toHaveTextContent("agent run: 'cfg-no-tools'");
  });

  it('shows a usable empty state instead of zeros', () => {
    render(
      <QualityDashboard
        data={{
          ...data,
          empty: {
            isEmpty: true,
            reason: 'no-runs',
            message: 'No run has been recorded yet.',
            actions: ['Record the first run.'],
          },
          kpis: {
            runs: 0,
            latestPassRate: null,
            previousPassRate: null,
            passRateDelta: null,
            latestP50: null,
            latestP95: null,
            regressions: null,
          },
          runs: [],
          latestItems: [],
          regressions: { needsTwoRuns: true, items: [] },
          traces: {},
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No quality data yet');
    expect(screen.getByRole('list', { name: 'Next steps' })).toHaveTextContent('Record the first run.');
    expect(screen.queryByText('0%')).toBeNull();
  });
});
