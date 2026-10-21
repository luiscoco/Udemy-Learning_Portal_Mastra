# Design

## Scope derivation

`storageScopeOf(principal)`: null → `'guest'`, otherwise `'u' + fnv1a32(sub).toString(16).padStart(8, '0')`. The browser has no synchronous SHA API, and this value is only a key namespace, not a secret or an access check. A collision between two learners on one browser is about 1 in 4 billion; it would mix their local display only, never server data.

## Claim once

`claimGuest(storage, guestKey, scopedKey)`: if `scopedKey` is absent and `guestKey` is present, copy it to `scopedKey` and remove `guestKey`. It runs when the scope changes to a learner scope, for the progress key and for each scratch key read. This is what moves the pre-change data to the learner who used it, which on a local install is the only learner. It never merges into existing learner data, so learner B never receives learner A's data once A has signed out (A's data is no longer under guest).

## Progress store

`LocalStorageProgressStore.setScope(scope)` changes the active key, clears the cache and notifies subscribers, so React re-renders with the new learner's records. The cross-tab `storage` listener compares against the active key. `MemoryProgressStore` ignores scopes (tests).

## Scratchpad

`Scratchpad` reads the session scope with `useSession()` and is keyed by scope, so it remounts and reloads its text when the learner changes.

## Migration

`plan()` adds `{src, dest}` for `memory/*.jsonl` regular files. The existing `.db(-suffix)` rule is unchanged.
