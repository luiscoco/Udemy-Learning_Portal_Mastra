import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

// React owns the DOM; Prism is used only as a tokenizer, never for automatic DOM mutation.
Prism.manual = true;

const aliases: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  html: 'markup',
  xml: 'markup',
  md: 'markdown',
  text: 'plain',
  txt: 'plain',
  plaintext: 'plain',
};
const supported = new Set([
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'bash',
  'python',
  'sql',
  'yaml',
  'markdown',
  'markup',
  'css',
]);

export function codeLanguage(language: string): string {
  const normalized = language.toLowerCase().trim();
  const name = aliases[normalized] ?? normalized;
  return supported.has(name) ? name : 'plain';
}

export { Prism };
