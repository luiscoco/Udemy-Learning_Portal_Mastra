import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ScoreCard as Data } from '@mlp/contracts';
import { ScoreCard, scoreCardOf } from './ScoreCard';

const data: Data = {
  scorerId: 'rubric-answer-scorer',
  rubricId: 'workflow-steps',
  question: 'How does a Mastra workflow run its steps?',
  answer: 'Steps run in order.',
  reference: 'A Mastra workflow runs its steps in a fixed, explicit order.',
  keyPoints: [
    { id: 'order', label: 'Steps run in a fixed order' },
    { id: 'chaining', label: 'then passes output on' },
  ],
  score: 0.8,
  notScorable: null,
  passThreshold: 0.7,
  passed: true,
  criteria: [
    {
      id: 'completeness',
      label: 'Expected key points covered',
      kind: 'completeness',
      weight: 0.6,
      score: 0.5,
      contribution: 0.3,
      evidence: ['Steps run in a fixed order: “Steps run in order.”'],
      missing: ['then passes output on'],
    },
    {
      id: 'forbidden-claims',
      label: 'Known-wrong claims',
      kind: 'penalty',
      weight: 0.35,
      score: 1,
      contribution: 0,
      evidence: [],
      missing: [],
    },
  ],
  formula: 'clamp(0.6 × 0.5 + 0.4 × 1 − 0 − 0, 0, 1) = 0.7',
  reason: 'Completeness 1/2 <b>key</b> points.',
  fixtures: [
    {
      name: 'reference answer',
      rubricId: 'workflow-steps',
      expectedScore: 1,
      actualScore: 1,
      expectedPassed: true,
      actualPassed: true,
      ok: true,
      detail: 'missing: none',
    },
    {
      name: 'empty',
      rubricId: 'workflow-steps',
      expectedScore: null,
      actualScore: 0,
      expectedPassed: null,
      actualPassed: false,
      ok: false,
      detail: 'expected not scorable',
    },
  ],
};

describe('ScoreCard', () => {
  it('only accepts outputs that match the contract', () => {
    expect(scoreCardOf({ scoreCard: data })).toEqual(data);
    expect(scoreCardOf({ scoreCard: { score: 2 } })).toBeNull();
    expect(scoreCardOf(null)).toBeNull();
  });

  it('shows the score, criteria evidence and missing items, formula and fixtures as text', () => {
    render(<ScoreCard data={data} />);
    expect(screen.getByRole('status')).toHaveTextContent('0.8Pass');
    expect(screen.getByRole('list', { name: 'Evidence for Expected key points covered' })).toHaveTextContent(
      'Steps run in order.',
    );
    expect(screen.getByRole('list', { name: 'Missing for Expected key points covered' })).toHaveTextContent(
      'then passes output on',
    );
    expect(screen.getByTestId('score-formula')).toHaveTextContent('= 0.7');
    expect(screen.getByText('Completeness 1/2 <b>key</b> points.')).toBeInTheDocument();
    expect(screen.getByText(/Golden scorer fixtures: 1\/2 pass/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Golden scorer fixtures' })).toHaveTextContent('fail: workflow-steps · empty');
  });

  it('shows a not-scorable result without a score', () => {
    render(
      <ScoreCard
        data={{ ...data, score: null, passed: null, notScorable: 'the answer has fewer than 3 words', criteria: [], formula: '' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('—Not scorable');
    expect(screen.queryByRole('table')).toBeNull();
  });
});
