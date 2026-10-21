/**
 * Heuristic prompt-injection scanner (app-level, deterministic). It catches common, blunt patterns and
 * is easy to evade on purpose: the lab shows a disguised injection getting through. Never rely on it as
 * the only defence; the tool gateway is what keeps side effects safe.
 */
export type InjectionRule = 'override' | 'role-marker' | 'tool-directive' | 'exfil-destination' | 'hidden-text';

export interface Finding {
  rule: InjectionRule;
  /** The flagged sentence, shortened for display. */
  excerpt: string;
}

/** Destinations that may legitimately appear in documents (the shop's own domain). */
export const ALLOWED_DOMAINS = ['shop.example'];
const TOOL_NAMES = ['searchDocs', 'sendEmail', 'issueRefund'];

/** Zero-width characters and Unicode tag characters (written as escapes so they stay visible in source). */
const HIDDEN = new RegExp(
  '[' +
    [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map((c) => String.fromCharCode(c)).join('') +
    ']|[' +
    String.fromCodePoint(0xe0000) +
    '-' +
    String.fromCodePoint(0xe007f) +
    ']',
  'u',
);

const RULES: { rule: InjectionRule; test: (s: string) => boolean }[] = [
  {
    rule: 'override',
    test: (s) =>
      /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.]{0,20}\b(instructions?|rules?|prompts?)\b/i.test(
        s,
      ),
  },
  { rule: 'role-marker', test: (s) => /(^|\s)(system|assistant|developer)\s*:|<\|[^|]*\|>|\[\/?INST\]/i.test(s) },
  {
    rule: 'tool-directive',
    test: (s) => TOOL_NAMES.some((t) => new RegExp(`\\b(call|use|run|invoke|execute)\\b[^.]{0,30}\\b${t}\\b`, 'i').test(s)),
  },
  {
    rule: 'exfil-destination',
    test: (s) =>
      [...s.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)|https?:\/\/([\w-]+(?:\.[\w-]+)+)/gi)].some((m) => {
        const domain = (m[1] ?? m[2] ?? '').toLowerCase();
        return !ALLOWED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
      }) && /\b(send|forward|email|share|copy|post|upload|cc)\b/i.test(s),
  },
  // Zero-width characters and Unicode tag characters hide instructions from human reviewers.
  { rule: 'hidden-text', test: (s) => HIDDEN.test(s) },
];

/** Sentences, split at . ! ? followed by whitespace (so e-mail addresses and URLs stay whole). */
export const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

const short = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

export function scanForInjection(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const s of sentencesOf(text)) for (const r of RULES) if (r.test(s)) findings.push({ rule: r.rule, excerpt: short(s) });
  return findings;
}

/** Removes every sentence with a finding. What remains is still untrusted: removal only lowers the risk. */
export function quarantine(text: string): { text: string; removed: number } {
  const kept: string[] = [];
  let removed = 0;
  for (const s of sentencesOf(text)) {
    if (RULES.some((r) => r.test(s))) removed += 1;
    else kept.push(s);
  }
  return { text: kept.join(' '), removed };
}
