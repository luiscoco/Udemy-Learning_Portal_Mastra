import type { CatalogModule } from '@mlp/contracts';

/**
 * Course modules in fixed order. module-00 is the platform orientation (Dummy Lab 00),
 * modules 01–15 are the course. Titles with titleConfirmed=false are placeholders until
 * the course outline for those modules is supplied.
 */
export const MODULES: CatalogModule[] = [
  { id: 'module-00', number: 0, title: 'Platform Orientation', titleConfirmed: true, labIds: ['lab-00'] },
  { id: 'module-01', number: 1, title: 'Mastra Foundations', titleConfirmed: true, labIds: [] },
  { id: 'module-02', number: 2, title: 'Agent Generation and Streaming', titleConfirmed: true, labIds: [] },
  { id: 'module-03', number: 3, title: 'Tools and Function Calling', titleConfirmed: true, labIds: [] },
  { id: 'module-04', number: 4, title: 'Agent Configuration and Context', titleConfirmed: true, labIds: [] },
  { id: 'module-05', number: 5, title: 'Conversational Memory', titleConfirmed: true, labIds: [] },
  { id: 'module-06', number: 6, title: 'Module 06 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-07', number: 7, title: 'Module 07 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-08', number: 8, title: 'Module 08 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-09', number: 9, title: 'Module 09 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-10', number: 10, title: 'Module 10 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-11', number: 11, title: 'Module 11 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-12', number: 12, title: 'Module 12 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-13', number: 13, title: 'Module 13 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-14', number: 14, title: 'Module 14 (title pending)', titleConfirmed: false, labIds: [] },
  { id: 'module-15', number: 15, title: 'Module 15 (title pending)', titleConfirmed: false, labIds: [] },
];
