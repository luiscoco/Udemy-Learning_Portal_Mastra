/**
 * Which SDK method calls which API route. The API contract test requires this to list exactly the
 * routes the server registers, so a new route cannot ship without a typed client method.
 */
export const CLIENT_ROUTES = {
  'GET /api/tutor/settings': 'tutor.settings',
  'POST /api/tutor/answer': 'tutor.answer',
  'GET /api/health': 'health',
  'GET /api/ready': 'ready',
  'GET /api/catalog': 'catalog',
  'POST /api/auth/local-session': 'auth.localSession',
  'GET /api/auth/session': 'auth.session',
  'POST /api/auth/login': 'auth.login',
  'POST /api/auth/logout': 'auth.logout',
  'GET /api/progress': 'progress.get',
  'POST /api/progress/import': 'progress.import',
  'POST /api/progress/:labId': 'progress.save',
  'POST /api/progress/:labId/reset': 'progress.reset',
  'GET /api/labs': 'labs.list',
  'GET /api/labs/:labId': 'labs.get',
  'GET /api/labs/:labId/source': 'labs.source',
  'GET /api/labs/:labId/preflight': 'labs.preflight',
  'POST /api/labs/:labId/runs': 'runs.start',
  'GET /api/runs/:runId': 'runs.get',
  'GET /api/runs': 'runs.recent',
  'POST /api/runs/:runId/recover': 'runs.recover',
  'POST /api/runs/:runId/cancel': 'runs.cancel',
  'POST /api/runs/:runId/approvals/:approvalId': 'runs.decide',
  'GET /api/runs/:runId/events': 'runs.events',
} as const;
export type ClientRouteKey = keyof typeof CLIENT_ROUTES;
