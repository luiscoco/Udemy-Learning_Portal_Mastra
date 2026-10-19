import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EvalReport as Data } from '@mlp/contracts';
import { EvalReport, evalReportOf } from './EvalReport';

const data: Data = {
  dataset: {
    id: 'course-faq',
    name: 'Course FAQ',
    version: 5,
    seedRevision: 2,
    revisionVersions: { '1': 3, '2': 5 },
    versions: [3, 4, 5].map((version) => ({ version, createdAt: '2026-10-19T10:00:00.000Z' })),
  },
  experiment: {
    id: 'exp-1',
    datasetVersion: 3,
    revision: 1,
    status: 'completed',
    targetId: 'faq-agent',
    provider: 'offline-sim',
    startedAt: '2026-10-19T10:00:00.000Z',
    completedAt: '2026-10-19T10:00:01.000Z',
    durationMs: 1000,
  },
  items: [
    {
      itemId: 'i1',
      externalId: 'suspend-resume',
      title: 'Suspend and resume',
      itemVersion: 2,
      input: 'How can a Mastra workflow pause for a human?',
      answer: 'A step can call <b>suspend</b>.',
      scores: [{ scorerId: 'scenario-assertions', score: 0.5, reason: '✗ Mentions “resume” (not found)', notScorable: null }],
      assertions: [
        { id: 'mentions:suspend', label: 'Mentions “suspend”', passed: true, detail: 'found' },
        { id: 'mentions:resume', label: 'Mentions “resume”', passed: false, detail: 'not found' },
      ],
      passed: false,
      durationMs: 12,
      error: null,
    },
  ],
  summary: { total: 1, passed: 0, failed: 1, errored: 0, passRate: 0 },
};

describe('EvalReport', () => {
  it('only accepts outputs that match the contract', () => {
    expect(evalReportOf({ evalReport: data })).toEqual(data);
    expect(evalReportOf({ evalReport: { items: [] } })).toBeNull();
    expect(evalReportOf(null)).toBeNull();
  });

  it('shows the summary, the pinned version and each scenario’s assertions as text', async () => {
    const user = userEvent.setup();
    render(<EvalReport data={data} />);
    expect(screen.getByRole('status')).toHaveTextContent('0/1scenarios pass (pass rate 0)mock provider (offline)');
    expect(screen.getByRole('list', { name: 'Dataset versions' })).toHaveTextContent('v3 = revision 1 (this run)');
    await user.click(screen.getByText('Suspend and resume'));
    expect(screen.getByRole('list', { name: 'Assertions of Suspend and resume' })).toHaveTextContent(
      'fails: Mentions “resume” (not found)',
    );
    expect(screen.getByText(/A step can call <b>suspend<\/b>\./)).toBeInTheDocument();
  });
});
