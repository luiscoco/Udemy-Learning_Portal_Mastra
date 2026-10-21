/**
 * Per-learner scopes for data kept in browser storage (progress, scratch notes).
 *
 * Scoping stops a second learner on a shared browser from seeing the first learner's data. It is not a
 * security boundary: any same-origin script can read localStorage. Private data belongs on the server.
 */
export const GUEST_SCOPE = 'guest';

/** FNV-1a 32-bit: a stable key namespace, not a secret (the browser has no synchronous SHA). */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function storageScopeOf(principal: { sub: string } | null | undefined): string {
  return principal ? `u${fnv1a(principal.sub)}` : GUEST_SCOPE;
}

/** Guest keeps the original unscoped key, so data saved before scoping is not lost. */
export const progressKey = (scope: string) => (scope === GUEST_SCOPE ? 'mlp.progress.v1' : `mlp.progress.v1:${scope}`);
export const scratchKey = (scope: string, labId: string) =>
  scope === GUEST_SCOPE ? `mlp.scratch.${labId}` : `mlp.scratch.${scope}.${labId}`;

/**
 * Claim once: a learner without data of their own takes over the guest data on this browser (including
 * data saved before scoping). Existing learner data is never merged or overwritten.
 */
export function claimGuest(storage: Storage, guestKey: string, scopedKey: string): void {
  if (guestKey === scopedKey) return;
  try {
    const guest = storage.getItem(guestKey);
    if (guest === null || storage.getItem(scopedKey) !== null) return;
    storage.setItem(scopedKey, guest);
    storage.removeItem(guestKey);
  } catch {
    // Storage disabled or full: leave both keys as they are.
  }
}
