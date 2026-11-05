/** Only noncredential identifiers are stored. Keys are collision-free and account/lab scoped. */
export const runPointerKey = (subject: string, labId: string) => `mlp.run.v1:${encodeURIComponent(subject)}:${labId}`;
export function readRunPointer(subject: string, labId: string): { runId: string | null; available: boolean } {
  try {
    const value = window.sessionStorage.getItem(runPointerKey(subject, labId));
    return { runId: value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null, available: true };
  } catch {
    return { runId: null, available: false };
  }
}
export function rememberRun(subject: string, labId: string, runId: string | null): boolean {
  try {
    if (runId === null) window.sessionStorage.removeItem(runPointerKey(subject, labId));
    else if (/^[a-zA-Z0-9_-]{1,128}$/.test(runId)) window.sessionStorage.setItem(runPointerKey(subject, labId), runId);
    else return false;
    return true;
  } catch {
    return false;
  }
}
