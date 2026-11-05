/**
 * Every API route, classified (L62). `public` routes return no learner data; `tenant` routes need the
 * owning learner's session (anonymous → 401, another learner → 404). The route audit test fails when a
 * registered route is missing here, or listed here but no longer registered.
 */
export const ROUTE_CLASSES = {
  'GET /api/health': 'public',
  'GET /api/ready': 'public',
  'GET /api/catalog': 'public',
  'GET /api/auth/session': 'public',
  'POST /api/auth/login': 'public',
  'POST /api/auth/logout': 'public',
  'GET /api/progress': 'tenant',
  'POST /api/progress/import': 'tenant',
  'POST /api/progress/:labId': 'tenant',
  'POST /api/progress/:labId/reset': 'tenant',
  'GET /api/labs': 'public',
  'GET /api/labs/:labId': 'public',
  'GET /api/labs/:labId/source': 'public',
  'GET /api/labs/:labId/preflight': 'public',
  'POST /api/labs/:labId/runs': 'tenant',
  'GET /api/runs/:runId': 'tenant',
  'GET /api/runs': 'tenant',
  'POST /api/runs/:runId/recover': 'tenant',
  'POST /api/runs/:runId/cancel': 'tenant',
  'POST /api/runs/:runId/approvals/:approvalId': 'tenant',
  'GET /api/runs/:runId/events': 'tenant',
} as const satisfies Record<string, 'public' | 'tenant'>;
export type RouteKey = keyof typeof ROUTE_CLASSES;
