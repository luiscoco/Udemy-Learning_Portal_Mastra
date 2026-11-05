import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { fakeProgressApi } from '../test-progress-api';
import { useProgressActions } from './progress-actions';
import { ProgressProvider } from './progress-context';
import { SyncedProgressStore } from './synced-progress-store';

it('ignores a late update or reset captured before the account changed', async () => {
  localStorage.clear();
  const server = fakeProgressApi();
  const store = new SyncedProgressStore(server.api, localStorage, 100000);
  store.setIdentity('dev:alice');
  await store.retrySync();
  let actions: ReturnType<typeof useProgressActions>;
  function Capture() {
    actions = useProgressActions('lab-00');
    return null;
  }
  const view = render(
    <ProgressProvider store={store}>
      <Capture />
    </ProgressProvider>,
  );
  try {
    const oldActions = actions!;
    await act(async () => {
      store.setIdentity('dev:bob');
      await store.retrySync();
    });
    act(() => {
      actions.update({ notes: 'Bob note' });
    });
    await act(async () => {
      await store.retrySync();
    });
    act(() => {
      oldActions.update({ notes: 'Late Alice result' });
      oldActions.reset();
    });
    await act(async () => {
      await store.retrySync();
    });
    expect(server.account('dev:bob').get('lab-00')?.record?.notes).toBe('Bob note');
    expect(server.account('dev:alice').size).toBe(0);
  } finally {
    view.unmount();
    store.dispose();
  }
});
