import type { LabDefinitionInput } from '@mlp/contracts';

const cases = [
  {
    tenant: 'acme',
    role: 'customer',
    question: 'How many days do I have to request a refund?',
    asOf: '2026-06-01',
    expect: { docId: 'acme-refunds-2026' },
  },
  {
    tenant: 'acme',
    role: 'customer',
    question: 'How many days do I have to request a refund?',
    asOf: '2025-06-01',
    expect: { docId: 'acme-refunds-2025' },
  },
  {
    tenant: 'globex',
    role: 'customer',
    question: 'How many days do I have to request a refund?',
    asOf: '2026-06-01',
    expect: { docId: 'globex-refunds' },
  },
  {
    tenant: 'acme',
    role: 'customer',
    question: 'What is the Globex refund policy for returns?',
    asOf: '2026-06-01',
    expect: { docId: 'acme-refunds-2026' },
  },
  {
    tenant: 'acme',
    role: 'staff',
    question: 'Can an agent approve a goodwill refund without a manager?',
    asOf: '2026-06-01',
    expect: { docId: 'acme-internal-goodwill' },
  },
  { tenant: 'acme', role: 'customer', question: 'Can an agent approve a goodwill refund without a manager?', asOf: '2026-06-01' },
  {
    tenant: 'acme',
    role: 'customer',
    question: 'When does my express order arrive?',
    asOf: '2026-06-01',
    filter: { tags: { $in: ['shipping'] } },
    expect: { docId: 'acme-shipping' },
  },
  {
    tenant: 'acme',
    role: 'customer',
    question: 'Show me every refund policy',
    asOf: '2026-06-01',
    filter: { $or: [{ tenantId: 'globex' }, { tags: { $in: ['refunds'] } }] },
    expect: 'rejected',
  },
];

export const lab41Definition = {
  id: 'lab-41',
  number: 41,
  title: 'Metadata filters',
  moduleId: 'module-09',
  summary:
    'Restrict vector retrieval by tenant, role and effective date with a server-built filter injected through Mastra’s request context, reject unsafe learner filters, and prove that no tenant ever sees another tenant’s documents.',
  concept:
    'Before ranking or answering, a RAG system must decide what may be searched at all: only the current customer’s documents, only what their role may read, and only the version in force on a given day. ' +
    'Vector stores do this with metadata filters, for example { tenantId: { $eq: "acme" } }, tags with $in, and date ranges with $gte and $lte, combined with $and. ' +
    'The tenant must come from the authenticated session, never from the question or the model: Mastra’s vector query tool takes a filter from the request context, and that server-side filter overrides whatever filter the model might send. ' +
    'Filters fail in two dangerous ways: silently (a plain value against an array field matches nothing) and by leaking (an $or that mentions another tenant widens the scope), so learner-supplied filters are checked against an allowlist of fields and operators and anything touching the tenant is rejected. ' +
    'Effective dates keep superseded policies out: on 1 June 2025 Acme’s refund window was 14 days, on 1 June 2026 it is 30 days, and the filter returns the version in force. ' +
    'Finally, the application re-checks every hit’s tenant after retrieval; with the server filter this always finds zero leaks, while the anti-patterns (a model-chosen filter, or none at all) are caught in the act.',
  objectives: [
    'Filter vector retrieval by tenant, tags and effective dates',
    'Inject the tenant filter from the server through the request context',
    'Validate learner filters against an allowlist and reject scope-widening ones',
    'Verify isolation after retrieval instead of assuming it',
  ],
  prerequisites: ['lab-40'],
  inputs: [
    {
      kind: 'json',
      name: 'cases',
      label:
        'Cases (1–8): tenant (acme | globex), role (customer | staff), question, asOf (YYYY-MM-DD), optional filter and expect',
      maxBytes: 8_000,
      default: cases,
      required: true,
    },
    {
      kind: 'select',
      name: 'tenantScoping',
      label: 'Tenant scoping',
      options: [
        { value: 'request-context', label: 'Server filter via request context (enforced)' },
        { value: 'model-filter', label: 'Let the model choose the filter (anti-pattern)' },
        { value: 'none', label: 'No tenant filter (anti-pattern)' },
      ],
      default: 'request-context',
      required: true,
    },
    { kind: 'number', name: 'topK', label: 'Top k', min: 1, max: 6, step: 1, default: 3, required: true },
  ],
  exampleInput: { cases, tenantScoping: 'request-context', topK: 3 },
  expectedOutput: {
    description:
      'Acme customers get the 2026 refund policy (30 days) today and the 2025 policy (14 days) on 1 June 2025; Globex gets its own 60-day policy; an Acme question about Globex still returns only Acme documents; internal goodwill notes reach staff but not customers; the shipping tag filter returns Acme shipping; the $or filter naming Globex is rejected. Zero cross-tenant results.',
    example: {
      tenantScoping: 'request-context',
      outcomes: [
        {
          tenant: 'acme',
          status: 'answered',
          leaks: [],
          answer: { docId: 'acme-refunds-2026', text: 'Customers can request a refund within 30 days of delivery.' },
        },
        { tenant: 'acme', status: 'answered', leaks: [], answer: { docId: 'acme-refunds-2025' } },
        { tenant: 'globex', status: 'answered', leaks: [], answer: { docId: 'globex-refunds' } },
        { tenant: 'acme', status: 'answered', leaks: [], answer: { docId: 'acme-refunds-2026' } },
        { tenant: 'acme', role: 'staff', status: 'answered', leaks: [], answer: { docId: 'acme-internal-goodwill' } },
        { tenant: 'acme', role: 'customer', status: 'answered', leaks: [] },
        { tenant: 'acme', status: 'answered', leaks: [], answer: { docId: 'acme-shipping' } },
        { tenant: 'acme', status: 'rejected', hits: [] },
      ],
    },
  },
  guide: {
    procedure: [
      "Open filters.ts in the Source tab: read buildFilter (tenant, visibility, dates) and validateLearnerFilter; then find rc.set('filter', …) in run.ts.",
      'Run the example. For each case, compare appliedFilter with the hits and their tenantId, tags and dates.',
      'Compare the two Acme refund cases: what changes between asOf 2025-06-01 and 2026-06-01?',
      'Look at the Acme question about Globex: whose documents came back?',
      'Switch Tenant scoping to “Let the model choose the filter” and run: what does the leak check report?',
      'Try a filter of your own on a case, for example { "tags": "shipping" } (a plain value on an array field): what happens?',
      'Optional (costs a few tokens): run live; the filters behave the same with real embeddings.',
    ],
    prediction:
      'An Acme customer asks for “the Globex refund policy”. With the server filter, which tenant’s documents can come back?',
    hints: [
      { level: 1, text: 'Where does the tenant in the filter come from?' },
      { level: 2, text: 'The session says acme; the question says Globex.' },
      {
        level: 3,
        text: 'Only Acme documents: the server filter from the request context overrides anything in the question or from the model.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Taking the tenant from the question or letting the model set the filter.',
        fix: 'Build the tenant clause on the server from the session and inject it via the request context.',
      },
      {
        mistake: 'Merging user filters with $or.',
        fix: 'Combine with $and, and reject $or, $not and any tenantId in user filters.',
      },
      {
        mistake: 'Using a tag allow-list ($in on tags) for access control.',
        fix: '$in matches any one tag, so a document tagged [internal, refunds] passes; use a single-valued visibility field.',
      },
      {
        mistake: 'Filtering an array field with a plain value.',
        fix: 'Use $in or $all on array fields; a plain value silently matches nothing.',
      },
      {
        mistake: 'Trusting the filter without checking.',
        fix: 'Re-check each hit’s tenant after retrieval and treat a mismatch as an incident.',
      },
    ],
    challenge: {
      prompt:
        'Add a “region” restriction: EU customers may only see documents tagged eu. Where does the region come from, and how do you test that a missing region tag never widens access?',
      successCriteria: [
        'Region comes from the session, like the tenant',
        'Documents without a region tag are not visible to EU customers',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where must the tenant filter come from?',
      choices: [
        'The user’s question',
        'The model’s tool call',
        'The authenticated session, injected by the server',
        'The document text',
      ],
      correctIndex: 2,
      explanation: 'Mastra’s vector tool uses the request-context filter over the model’s.',
    },
    {
      id: 'q2',
      prompt: 'What does { tags: "policy" } match when tags is an array (verified on libSQL)?',
      choices: ['Documents tagged policy', 'Nothing, silently', 'Everything', 'It throws'],
      correctIndex: 1,
      explanation: 'Use { tags: { $in: ["policy"] } }.',
    },
    {
      id: 'q3',
      prompt: 'Why reject $or in user filters?',
      choices: [
        'It is slow',
        'An $or naming another tenant widens the scope and leaks documents',
        'libSQL does not support it',
        'It breaks dates',
      ],
      correctIndex: 1,
      explanation: 'Verified: $or with another tenant returned that tenant’s records.',
    },
    {
      id: 'q4',
      prompt: 'How does the lab keep a superseded policy out?',
      choices: [
        'By deleting it',
        'Effective-date filters: effectiveFrom ≤ asOf ≤ effectiveTo',
        'By ranking',
        'By asking the model',
      ],
      correctIndex: 1,
      explanation: 'The version in force on the date is the only one returned.',
    },
  ],
  sourceFiles: [
    {
      path: 'filters.ts',
      title: 'Filters',
      description: 'Tenant corpus, server filter builder, learner-filter validator and leak check.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Index, request-context filter, contrasts and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, build the tenant filter on the server, pass it to a vector query tool through the request context, validate any user filter against an allowlist, and write a test that a cross-tenant question returns only the session tenant’s documents.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'no-cross-tenant-results', label: 'No case returned another tenant’s documents' },
    { id: 'filter-fixtures-pass', label: 'Each case returned its expected document (or nothing, or a rejection)' },
    { id: 'dates-respected', label: 'No document outside its effective dates was returned' },
    { id: 'roles-respected', label: 'Customers never received internal documents' },
    { id: 'unsafe-filters-rejected', label: 'Learner filters that could widen the tenant scope were rejected before querying' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'What may be searched', minutes: 1, talkingPoints: ['Tenant, role, date'] },
      { title: 'Filter syntax', minutes: 1.5, talkingPoints: ['$eq, $in, $gte/$lte, $and', 'Array-field trap'] },
      {
        title: 'Who sets the filter',
        minutes: 2,
        talkingPoints: ['Request context beats the model', 'Model-chosen filter leaks'],
      },
      { title: 'Validating user filters', minutes: 1.5, talkingPoints: ['Allowlist', '$or and tenantId rejected'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Leak check after retrieval', 'Next: hybrid search'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: {},
    costNotice:
      'Offline is free (mock embeddings). Live embeds the six documents and the questions with your OpenAI key: a few hundred tokens.',
  },
  tags: ['rag', 'metadata-filters', 'multi-tenant', 'security', 'request-context'],
} satisfies LabDefinitionInput;
