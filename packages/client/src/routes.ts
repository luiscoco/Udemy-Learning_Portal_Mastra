/**
 * Which SDK method calls which API route. The API contract test requires this to list exactly the
 * routes the server registers, so a new route cannot ship without a typed client method.
 */
export const CLIENT_ROUTES = {
  'GET /api/health': 'health',
  'GET /api/ready': 'ready',
  'GET /api/catalog': 'catalog',
  'GET /api/auth/session': 'auth.session',
  'POST /api/auth/login': 'auth.login',
  'POST /api/auth/logout': 'auth.logout',
  'GET /api/labs': 'labs.list',
  'GET /api/labs/:labId': 'labs.get',
  'GET /api/labs/:labId/source': 'labs.source',
  'GET /api/labs/:labId/preflight': 'labs.preflight',
  'POST /api/labs/:labId/runs': 'runs.start',
  'GET /api/runs/:runId': 'runs.get',
  'POST /api/runs/:runId/cancel': 'runs.cancel',
  'POST /api/runs/:runId/approvals/:approvalId': 'runs.decide',
  'GET /api/runs/:runId/events': 'runs.events',
} as const;
export type ClientRouteKey = keyof typeof CLIENT_ROUTES;
