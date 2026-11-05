import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { emptyProgress } from '@mlp/contracts';
import { ApiClientError } from '@mlp/client';
import { ProgressProvider } from '../lib/progress-context';
import { SyncedProgressStore } from '../lib/synced-progress-store';
import { fakeProgressApi } from '../test-progress-api';
import { ProgressSyncNotice } from './ProgressSyncNotice';

const stores: SyncedProgressStore[] = [];
afterEach(() => {
  cleanup();
  stores.splice(0).forEach((s) => s.dispose());
  localStorage.clear();
});
function setup() {
  const server = fakeProgressApi();
  const store = new SyncedProgressStore(server.api, localStorage, 100000);
  stores.push(store);
  render(
    <ProgressProvider store={store}>
      <ProgressSyncNotice />
    </ProgressProvider>,
  );
  return { server, store };
}
it('announces account saves and exposes retry for an actual connection failure', async () => {
  const { server, store } = setup();
  await act(async () => {
    store.setIdentity('dev:alice');
    await store.retrySync();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Progress saved to your account.');
  const save = server.api.save.getMockImplementation()!;
  server.api.save.mockRejectedValue(new ApiClientError('NETWORK', 'offline', 0));
  await act(async () => {
    store.save({ ...emptyProgress('lab-00'), notes: 'Draft' });
    await store.retrySync();
  });
  expect(screen.getByRole('button', { name: 'Retry progress sync' })).toBeVisible();
  server.api.save.mockImplementation(save);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry progress sync' }));
  expect(await screen.findByText('Progress saved to your account.')).toBeVisible();
});
it('lets the learner explicitly keep a saved account version after a conflict', async () => {
  const { server, store } = setup();
  await server.api.save('dev:alice', 'lab-00', { baseRevision: 0, record: emptyProgress('lab-00') });
  await act(async () => {
    store.setIdentity('dev:alice');
    await store.retrySync();
  });
  await server.api.save('dev:alice', 'lab-00', {
    baseRevision: 1,
    record: { ...emptyProgress('lab-00'), notes: 'Other device' },
  });
  await act(async () => {
    store.save({ ...emptyProgress('lab-00'), notes: 'My draft' });
    await store.retrySync();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Progress changed on another device for lab-00');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Use saved progress' }));
  expect(await screen.findByText('Progress saved to your account.')).toBeVisible();
  expect(store.get('lab-00')?.notes).toBe('Other device');
});
