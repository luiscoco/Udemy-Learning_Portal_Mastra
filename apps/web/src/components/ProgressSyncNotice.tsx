import { useSyncExternalStore } from 'react';
import { useProgressStore } from '../lib/progress-context';
import { downloadText } from '../lib/download';

export function ProgressSyncNotice() {
  const store = useProgressStore();
  const state = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSyncState?.() ?? null,
    () => null,
  );
  if (!state) return null;
  const conflict = state.conflicts[0];
  const text =
    state.phase === 'guest'
      ? 'Progress stays on this browser. Sign in to save it to your account.'
      : state.phase === 'conflict'
        ? `Progress changed on another device for ${conflict}. Your device edits are kept until you choose a version.`
        : state.phase === 'syncing'
          ? 'Saving progress to your account…'
          : state.phase === 'saved'
            ? 'Progress saved to your account.'
            : (state.message ?? 'Progress is waiting to sync. Your edits are kept on this device.');
  return (
    <section
      aria-label="Progress synchronization"
      className="mb-6 rounded-lg border border-border bg-surface-muted p-3 text-sm text-fg-muted"
      data-testid="progress-sync"
    >
      <p role="status" aria-live="polite">
        {text}
      </p>
      {!state.localDurable ? (
        <p className="mt-1">
          This browser cannot keep an offline copy. Keep this tab open until your progress is saved to your account.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3">
        {conflict ? (
          <>
            <button
              type="button"
              className="underline hover:text-accent"
              onClick={() => void store.resolveConflict?.(conflict, 'server')}
            >
              Use saved progress
            </button>
            <button
              type="button"
              className="underline hover:text-accent"
              onClick={() => void store.resolveConflict?.(conflict, 'device')}
            >
              Keep this device’s changes
            </button>
          </>
        ) : null}
        {state.phase === 'offline' ? (
          <button type="button" className="underline hover:text-accent" onClick={() => void store.retrySync?.()}>
            Retry progress sync
          </button>
        ) : null}
        {state.hasBackup ? (
          <button
            type="button"
            className="underline hover:text-accent"
            onClick={() =>
              downloadText(
                'learner-progress-device-backup.json',
                JSON.stringify(store.exportBackup?.(), null, 2),
                'application/json',
              )
            }
          >
            Download device backup
          </button>
        ) : null}
      </div>
    </section>
  );
}
