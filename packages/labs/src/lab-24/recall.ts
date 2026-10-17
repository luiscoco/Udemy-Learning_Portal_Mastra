import { createConceptEmbedder } from '@mlp/mastra-runtime';

/**
 * Concept groups for the OFFLINE stand-in embedder. Words in one group share a dimension, so
 * "avoid eating" and "allergic to peanuts" end up close, like they would with a real embedding model.
 */
export const CONCEPT_GROUPS = [
  [
    'allergic',
    'allergy',
    'peanut',
    'nut',
    'shellfish',
    'gluten',
    'food',
    'eat',
    'eating',
    'dinner',
    'lunch',
    'meal',
    'dish',
    'avoid',
    'menu',
  ],
  ['dog', 'cat', 'pet', 'puppy', 'walk'],
  ['live', 'city', 'berlin', 'lisbon', 'home', 'move', 'flat'],
  ['colour', 'color', 'blue', 'red', 'green', 'favourite'],
  ['work', 'job', 'nurse', 'shift', 'night', 'office', 'colleague', 'team'],
];

export const offlineEmbedder = () => createConceptEmbedder({ groups: CONCEPT_GROUPS, dimensions: 64 });

/** The live embedding model (Mastra model router id). Needs OPENAI_API_KEY on the server. */
export const LIVE_EMBEDDER = 'openai/text-embedding-3-small';

const STOP = new Set(['about', 'their', 'there', 'which', 'would', 'should', 'these', 'those', 'where', 'while', 'really']);

/** Content words of a fact, stemmed, used to check that an answer actually uses it. */
export function keywordsOf(fact: string): string[] {
  return [
    ...new Set(
      (fact.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, '')),
    ),
  ];
}

/** Parses Mastra's injected block of messages remembered from other conversations (user lines only). */
export function rememberedUserLines(system: string): string[] {
  const block = system.match(/<remembered_from_other_conversation>([\s\S]*?)<end_remembered_from_other_conversation>/)?.[1] ?? '';
  return [...block.matchAll(/User: (.+)/g)].map((m) => m[1]!.trim());
}
