import type { CatalogModule } from '@mlp/contracts';
import { LABS } from './labs.js';

const MODULE_TITLES: { number: number; title: string; confirmed: boolean }[] = [
  { number: 0, title: 'Platform Orientation', confirmed: true },
  { number: 1, title: 'Mastra Foundations', confirmed: true },
  { number: 2, title: 'Agent Generation and Streaming', confirmed: true },
  { number: 3, title: 'Tools and Function Calling', confirmed: true },
  { number: 4, title: 'Agent Configuration and Context', confirmed: true },
  { number: 5, title: 'Conversational Memory', confirmed: true },
  { number: 6, title: 'Workflow Foundations', confirmed: true },
  { number: 7, title: 'Advanced Workflows', confirmed: true },
  { number: 8, title: 'RAG and Knowledge Systems', confirmed: true },
  { number: 9, title: 'Advanced RAG', confirmed: true },
  { number: 10, title: 'Model Context Protocol', confirmed: true },
  { number: 11, title: 'Multi-Agent Architectures', confirmed: true },
  ...Array.from({ length: 4 }, (_, i) => ({
    number: i + 12,
    title: `Module ${String(i + 12).padStart(2, '0')} — title pending`,
    confirmed: false,
  })),
];

/**
 * Course modules in fixed order. module-00 is the platform orientation (Dummy Lab 00),
 * modules 01–15 hold five labs each. Lab membership is derived from the lab list.
 */
export const MODULES: CatalogModule[] = MODULE_TITLES.map(({ number, title, confirmed }) => {
  const id = `module-${String(number).padStart(2, '0')}`;
  return {
    id,
    number,
    title,
    titleConfirmed: confirmed,
    labIds: LABS.filter((l) => l.moduleId === id)
      .sort((a, b) => a.number - b.number)
      .map((l) => l.id),
  };
});
