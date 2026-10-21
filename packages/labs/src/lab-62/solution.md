# Tenant isolation

Filtering by a `resourceId` does not isolate learners when every learner shares one store: the id is a value the caller chooses. Isolation has to come from **which store** a run can open, and that choice must be made on the server from the verified session.

```ts
// apps/api/src/app.ts: each run gets services built for its authenticated owner.
const runner = new LabRunner({
  registry,
  services: baseServices,
  servicesFor: (ownerId) => baseServices.forTenant(ownerId),
  liveEnabled,
});

// packages/labs/src/services.ts: the owner is hashed, never used as a path.
export const partitionOf = (ownerId: string | null) =>
  ownerId === null ? 'local' : createHash('sha256').update(`tenant:${ownerId}`).digest('hex').slice(0, 24);
// memory, document library and saved files all resolve under <memoryDir>/tenants/<partition>/
```

Lab code keeps calling `ctx.services.memory.open('lab-21')`; the same name opens a different file per learner, so constant ids such as `'learner'` stay safe.

Challenge outline: add a `listOwnedBy(ownerId)` method to `LabRunner` (the runner has no list method yet) and a `GET /api/runs` route that returns `runner.listOwnedBy(req.principal.sub)`, classify it as `tenant` in `apps/api/src/route-classes.ts`, and extend `routes.audit.test.ts`: anonymous → 401, Bob's list must not contain Alice's run id, Alice's list must.

Legacy shared data from before L62 is not visible to anyone until you migrate it explicitly:

```sh
node scripts/migrate-tenant-data.mjs --owner dev:learner --dry-run
node scripts/migrate-tenant-data.mjs --owner dev:learner [--move]
```

Example input: `{ "learnerA": "alice", "learnerB": "bob", "note": "My exam retake is on Friday.", "hostileOwner": "../../etc/passwd" }`.
Expected: B lists A's thread in the shared store and nothing in his partition; `hostile.parentFolder` is `tenants`; the run is readable by A only.
