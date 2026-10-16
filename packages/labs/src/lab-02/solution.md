# Solution — a "contracts" layer

Add to `evidenceFor` in `inspect.ts`:

```ts
case 'contracts':
  return [
    { description: 'package.json depends on zod', file: `${candidate}/package.json`, test: (t) => 'zod' in deps(t) },
    { description: 'does not depend on @mastra/core', file: `${candidate}/package.json`, test: (t) => !('@mastra/core' in deps(t)) },
    { description: 'apps/web depends on it', file: 'apps/web/package.json', test: (t) => '@mlp/contracts' in deps(t) },
    { description: 'apps/api depends on it', file: 'apps/api/package.json', test: (t) => '@mlp/contracts' in deps(t) },
  ];
```

**Why no `@mastra/core` in contracts?** Contracts are imported by the browser. If they pulled in `@mastra/core`, the web bundle would grow by megabytes and server-only code (and potentially configuration) would leak into the client. Contracts describe data shapes only; the runtime implements behaviour.
