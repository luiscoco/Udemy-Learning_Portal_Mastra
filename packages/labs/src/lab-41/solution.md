# Solution: tenant-safe filters injected by the server

```ts
import { RequestContext } from '@mastra/core/request-context';
import { createVectorQueryTool } from '@mastra/rag';

const searchDocs = createVectorQueryTool({ id: 'searchDocs', vectorStore: store, indexName, model: embedder }); // the model cannot filter

function filterFor(session: { tenant: string; role: 'customer' | 'staff' }, asOf: number, userFilter?: object) {
  if (userFilter && validateLearnerFilter(userFilter).length) throw new Error('FILTER_REJECTED'); // no tenantId, $or, $not; allowlisted fields/ops
  return {
    $and: [
      { tenantId: { $eq: session.tenant } }, // from the session, never the question
      { visibility: { $in: session.role === 'staff' ? ['public', 'internal'] : ['public'] } }, // single-valued
      { effectiveFrom: { $lte: asOf } },
      { effectiveTo: { $gte: asOf } },
      ...(userFilter ? [userFilter] : []),
    ],
  };
}

const requestContext = new RequestContext();
requestContext.set('filter', filterFor(session, 20260601)); // overrides any filter in the tool input
const out = await agent.generate(question, { requestContext });
```

After retrieval, assert that every hit's `tenantId` equals the session tenant, and alert if one does not.

**Challenge (region):** add `region` to the session and the filter (`{ region: { $in: [session.region, 'global'] } }`). Give every document an explicit region. A document with no region must never match, so test that it stays invisible to EU customers.
