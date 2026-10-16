import { useState } from 'react';
import type { LabDefinition, QuizQuestion } from '@mlp/contracts';
import { cn } from '../../lib/cn';
import { useProgressActions } from '../../lib/progress-actions';
import { Badge, Button } from '../ui/primitives';
import { Section } from './Section';

export const QUIZ_PASS_RATIO = 0.7;

export function scoreQuiz(questions: QuizQuestion[], answers: Record<string, number>) {
  const score = questions.filter((q) => answers[q.id] === q.correctIndex).length;
  return { score, total: questions.length, passed: score / questions.length >= QUIZ_PASS_RATIO };
}

export function QuizPanel({ definition }: { definition: LabDefinition }) {
  const { record, update } = useProgressActions(definition.id);
  const [answers, setAnswers] = useState<Record<string, number>>(record.quiz?.answers ?? {});
  const [submitted, setSubmitted] = useState(record.quiz !== null);
  const [missing, setMissing] = useState(false);
  const quiz = definition.quiz;
  const result = scoreQuiz(quiz, answers);
  const id = `${definition.id}-quiz`;

  const submit = () => {
    if (quiz.some((q) => answers[q.id] === undefined)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setSubmitted(true);
    update((cur) => ({ quiz: { ...result, answers, attempts: (cur.quiz?.attempts ?? 0) + 1 } }));
  };

  return (
    <Section
      title="Quiz"
      id={id}
      actions={record.quiz ? <Badge tone={record.quiz.passed ? 'success' : 'warning'}>Best: {record.quiz.score}/{record.quiz.total}</Badge> : null}
    >
      <p className="text-sm text-fg-muted">
        {quiz.length} questions · pass with {Math.ceil(quiz.length * QUIZ_PASS_RATIO)} correct.
      </p>
      <ol className="flex flex-col gap-5">
        {quiz.map((q, qi) => {
          const chosen = answers[q.id];
          return (
            <li key={q.id}>
              <fieldset className="rounded-xl border border-border bg-surface p-4">
                <legend className="px-1 font-medium">
                  {qi + 1}. {q.prompt}
                </legend>
                <div className="mt-2 flex flex-col gap-1.5">
                  {q.choices.map((c, ci) => {
                    const correct = submitted && ci === q.correctIndex;
                    const wrong = submitted && chosen === ci && ci !== q.correctIndex;
                    return (
                      <label
                        key={c}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                          correct && 'bg-success-soft text-success',
                          wrong && 'bg-danger-soft text-danger',
                        )}
                      >
                        <input
                          type="radio"
                          name={`${id}-${q.id}`}
                          checked={chosen === ci}
                          disabled={submitted}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                        />
                        {c}
                        {correct ? <span className="sr-only"> (correct answer)</span> : null}
                        {wrong ? <span className="sr-only"> (your answer, incorrect)</span> : null}
                      </label>
                    );
                  })}
                </div>
                {submitted ? <p className="mt-3 text-sm text-fg-muted">{q.explanation}</p> : null}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {missing ? (
        <p role="alert" className="text-sm font-medium text-danger">
          Answer every question before submitting.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {submitted ? (
          <>
            <p role="status" className={cn('font-semibold', result.passed ? 'text-success' : 'text-warning')} data-testid="quiz-score">
              Score {result.score}/{result.total} — {result.passed ? 'passed' : 'not passed yet'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setSubmitted(false);
                setAnswers({});
              }}
            >
              Retake quiz
            </Button>
          </>
        ) : (
          <Button onClick={submit}>Submit answers</Button>
        )}
      </div>
    </Section>
  );
}
