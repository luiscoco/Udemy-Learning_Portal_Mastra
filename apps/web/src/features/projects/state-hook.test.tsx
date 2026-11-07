import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { projectStorageKey, useProjectState } from './state';
function Probe({ account }: { account: string }) {
  const store = useProjectState(projectStorageKey(account, 'study-coach'));
  return (
    <>
      <output>{store.data.notes || 'Empty project'}</output>
      <button onClick={() => store.update((old) => ({ ...old, notes: 'Current evidence' }))}>Save evidence</button>
      {store.warning && <p role="alert">{store.warning}</p>}
    </>
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
it('retains current work and exposes an actionable warning when quota prevents saving', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded');
  });
  render(<Probe account="dev:alice" />);
  fireEvent.click(screen.getByRole('button', { name: 'Save evidence' }));
  expect(screen.getByRole('status')).toHaveTextContent('Current evidence');
  expect(screen.getByRole('alert')).toHaveTextContent('export a JSON backup');
});
it('remounts learner-keyed project state without exposing another account', () => {
  const view = render(<Probe key="alice" account="dev:alice" />);
  fireEvent.click(screen.getByRole('button', { name: 'Save evidence' }));
  view.rerender(<Probe key="bob" account="dev:bob" />);
  expect(screen.getByRole('status')).toHaveTextContent('Empty project');
  view.rerender(<Probe key="alice" account="dev:alice" />);
  expect(screen.getByRole('status')).toHaveTextContent('Current evidence');
});
