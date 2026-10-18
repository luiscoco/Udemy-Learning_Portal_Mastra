export const POLICIES = ['namespace', 'first-wins', 'reject'] as const;
export type CollisionPolicy = (typeof POLICIES)[number];

export interface Collision {
  name: string;
  servers: string[];
  resolution: string;
}

export interface Route {
  server: string;
  tool: string;
}

/**
 * Turns per-server toolsets into the agent's tool map.
 * namespace: Mastra-style `server_tool` keys. first-wins: flat names, the first server in `order` keeps a
 * shared name. reject: flat names, every shared name is excluded.
 */
export function exposeTools<T>(toolsets: Record<string, Record<string, T>>, order: readonly string[], policy: CollisionPolicy) {
  const servers = order.filter((s) => toolsets[s]);
  const owners = new Map<string, string[]>();
  for (const s of servers) for (const name of Object.keys(toolsets[s]!)) owners.set(name, [...(owners.get(name) ?? []), s]);
  const shared = [...owners].filter(([, s]) => s.length > 1);

  const tools: Record<string, T> = {};
  const routing: Record<string, Route> = {};
  const add = (key: string, server: string, tool: string) => {
    tools[key] = toolsets[server]![tool]!;
    routing[key] = { server, tool };
  };
  const collisions: Collision[] = shared.map(([name, s]) => ({
    name,
    servers: s,
    resolution:
      policy === 'namespace'
        ? `namespaced as ${s.map((x) => `${x}_${name}`).join(' and ')}`
        : policy === 'first-wins'
          ? `${s[0]}.${name} kept; ${s
              .slice(1)
              .map((x) => `${x}.${name}`)
              .join(', ')} shadowed`
          : `excluded from every server (${s.map((x) => `${x}.${name}`).join(', ')})`,
  }));

  for (const s of servers)
    for (const name of Object.keys(toolsets[s]!)) {
      if (policy === 'namespace') add(`${s}_${name}`, s, name);
      else {
        const o = owners.get(name)!;
        if (o.length === 1) add(name, s, name);
        else if (policy === 'first-wins' && o[0] === s) add(name, s, name);
      }
    }
  return { tools, routing, collisions };
}

/** `server_tool` keys that clash after namespacing, e.g. server a_b + tool c and server a + tool b_c. */
export function namespacedKeyCollisions(toolsets: Record<string, Record<string, unknown>>): Collision[] {
  const seen = new Map<string, string[]>();
  for (const [s, ts] of Object.entries(toolsets))
    for (const t of Object.keys(ts)) seen.set(`${s}_${t}`, [...(seen.get(`${s}_${t}`) ?? []), `${s}.${t}`]);
  return [...seen]
    .filter(([, v]) => v.length > 1)
    .map(([name, v]) => ({ name, servers: v, resolution: 'ambiguous namespaced key: rename a server or a tool' }));
}
