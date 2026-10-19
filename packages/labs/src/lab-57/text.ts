/**
 * Deterministic text helpers for the rubric scorer: no model, no randomness, so the same answer always
 * produces the same tokens, matches and score.
 */

const undouble = (w: string) => (/([b-df-hj-np-tv-z])\1$/.test(w) ? w.slice(0, -1) : w);

/** A light English stemmer: steps → step, running → run, validated / validates → validat. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length >= 6) w = undouble(w.slice(0, -3));
  else if (w.endsWith('ed') && w.length >= 5) w = undouble(w.slice(0, -2));
  if (w.endsWith('e') && w.length >= 5) w = w.slice(0, -1);
  return w;
}

export const tokens = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem);
export const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

export function sentences(s: string): string[] {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** True when `phrase` (already tokenised) appears as a contiguous run inside `words`. */
export function containsPhrase(words: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  for (let i = 0; i + phrase.length <= words.length; i++) if (phrase.every((p, j) => words[i + j] === p)) return true;
  return false;
}
