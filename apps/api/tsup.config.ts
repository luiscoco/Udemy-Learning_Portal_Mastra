import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Internal workspace packages ship as TS source, so bundle them; keep real npm deps external.
  noExternal: [/^@mlp\//],
});
