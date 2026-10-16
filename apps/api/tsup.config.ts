import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Internal workspace packages ship as TS source, so bundle them. Every other bare import
  // (@mastra/core, express, typescript…) stays external and is resolved from node_modules at runtime.
  noExternal: [/^@mlp\//],
  external: [/^(?!@mlp\/)[^./]/],
});
