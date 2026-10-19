import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { sentencesOf } from '../lab-51/grounding.js';
import type { Diagnosis, Incident, LogLine } from './schemas.js';

export const AGENT_IDS = ['extractor', 'diagnostician', 'communicator'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const INSTRUCTIONS: Record<AgentId, string> = {
  extractor:
    'You extract incident facts from a report. Return the affected service (checkout, search, auth or payments), the severity (sev1 = outage for many customers, sev2 = partial or degraded, sev3 = minor), up to five short symptoms in the reporter’s words, and whether customers are affected.',
  diagnostician:
    'You diagnose incidents from logs. Use only the log lines you are given. Return the most likely cause in one sentence, your confidence, and the ids of the log lines that support it (for example L2).',
  communicator:
    'You write public status-page updates. Write at most 80 words in plain language. Name the affected service exactly as given (for example checkout). Never include internal log ids, hostnames or code. State only facts from the incident and diagnosis you are given: do not invent actions, fixes or timelines. If the cause is unknown, say it is under investigation. End with when the next update will come.',
};

/** The typed payloads each agent receives: written by the workflow, never by another agent. */
export const prompts = {
  extract: (report: string) => `INCIDENT REPORT:\n${report}`,
  diagnose: (incident: Incident, logs: readonly LogLine[]) =>
    `INCIDENT:\n${JSON.stringify(incident)}\n\nLOGS:\n${logs.map((l) => `[${l.id}] ${l.at} ${l.level} ${l.message}`).join('\n')}`,
  communicate: (incident: Incident, diagnosis: Diagnosis | null) =>
    `INCIDENT:\n${JSON.stringify(incident)}\n\nDIAGNOSIS:\n${diagnosis ? JSON.stringify(diagnosis) : 'unavailable: the cause is under investigation'}`,
};

const section = (text: string, name: string) => {
  const start = text.indexOf(`${name}:\n`);
  if (start < 0) return '';
  const rest = text.slice(start + name.length + 2);
  const end = rest.search(/\n\n[A-Z ]+:\n/);
  return end < 0 ? rest : rest.slice(0, end);
};

/** Deterministic extraction: the offline extractor's answer (and a reference for the tests). */
export function extractOffline(report: string): Incident {
  const t = report.toLowerCase();
  const service = /checkout|cart|order/.test(t)
    ? 'checkout'
    : /search/.test(t)
      ? 'search'
      : /log ?in|sign in|auth|password/.test(t)
        ? 'auth'
        : 'payments';
  const severity = /cannot|can't|all |down|outage/.test(t) ? 'sev1' : /slow|some |intermittent|partial/.test(t) ? 'sev2' : 'sev3';
  const symptoms = sentencesOf(report)
    .map((s) => s.replace(/[.!?]$/, ''))
    .filter((s) => s.length >= 3)
    .slice(0, 5);
  return { service, severity, symptoms, customerImpact: /customer|user|order|shopper/.test(t) };
}

export function extractorScript() {
  return (view: PromptView): ScriptedTurn => ({
    text: JSON.stringify(extractOffline(section(view.lastUser, 'INCIDENT REPORT'))),
  });
}

export function diagnosticianScript() {
  return (view: PromptView): ScriptedTurn => {
    const lines = [...section(view.lastUser, 'LOGS').matchAll(/^\[(L\d+)\] (\S+) (\w+) (.+)$/gm)].map((m) => ({
      id: m[1]!,
      level: m[3]!,
      message: m[4]!,
    }));
    const errors = lines.filter((l) => l.level === 'error');
    const evidence = (errors.length ? errors : lines.filter((l) => l.level === 'warn')).slice(0, 3);
    const d: Diagnosis = {
      likelyCause: evidence.length
        ? `${evidence[0]!.message[0]!.toUpperCase()}${evidence[0]!.message.slice(1)}`
        : 'No clear cause in the logs',
      confidence: evidence.length >= 2 ? 'high' : evidence.length ? 'medium' : 'low',
      evidence: evidence.length ? evidence.map((l) => l.id) : [lines[0]?.id ?? 'L1'],
    };
    return { text: JSON.stringify(d) };
  };
}

export function communicatorScript() {
  return (view: PromptView): ScriptedTurn => {
    const incident = JSON.parse(section(view.lastUser, 'INCIDENT') || '{}') as Incident;
    const raw = section(view.lastUser, 'DIAGNOSIS');
    const diagnosis = raw.startsWith('{') ? (JSON.parse(raw) as Diagnosis) : null;
    const symptom = incident.symptoms?.[0] ?? 'an issue';
    const cause = diagnosis ? `Likely cause: ${diagnosis.likelyCause.replace(/[.]$/, '')}.` : 'The cause is under investigation.';
    return {
      text: `We are investigating a ${incident.severity} incident affecting ${incident.service}: ${symptom[0]!.toLowerCase()}${symptom.slice(1)}. ${cause} Next update in 30 minutes.`,
    };
  };
}
