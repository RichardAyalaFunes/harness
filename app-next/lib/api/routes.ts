// The API, defined once. Next route files (app/api/**/route.ts) re-export entries from here, and the in-process test
// shim dispatches to the same table, so tests exercise exactly what the server runs.
import { z } from 'zod';
import { AskBody, CompleteBody, DiffQuery, IdParam, MoveBody, NoQuery, RejectBody, ApproveBody, SlugParam, StagesQuery } from '../contracts/api.ts';
import { AppError, NotFound, errorBody } from '../contracts/errors.ts';
import { openDb } from '../db/connection.ts';
import { dbPath } from '../paths.ts';
import { approveProposal, approveReview, rejectProposal, rejectReview } from '../domain/approvals.ts';
import { askRole } from '../domain/ask.ts';
import { diff, matrix } from '../domain/brief.ts';
import { listCandidates, moveCandidate } from '../domain/candidates.ts';
import { studyFeedback } from '../domain/feedback.ts';
import { completeItem } from '../domain/learning.ts';
import { ME, positionsView, roleView, stagesView } from '../domain/views.ts';
import { getAssistModel, loadEnv } from '../model/index.ts';
import { defineRoute, respond } from '../obs/route.ts';
import { withTrace, setTraceAttrs } from '../obs/tracer.ts';
import { withSpan } from '../obs/tracer.ts';

loadEnv();

const db = () => openDb(dbPath()); // the path is read per call so tests can point the API at their own database
const roleParams = z.object({ id: SlugParam }).strict();
const idParams = z.object({ id: IdParam }).strict();
const none = z.object({}).strict();
const emptyBody = z.object({}).strict();

export const ROUTES = {
  'GET /api/me': defineRoute({ method: 'GET', pattern: '/api/me', query: NoQuery }, () => ({ id: ME })),
  'GET /api/positions': defineRoute({ method: 'GET', pattern: '/api/positions', query: NoQuery }, () => positionsView(db())),
  'GET /api/roles/:id': defineRoute({ method: 'GET', pattern: '/api/roles/:id', params: roleParams, query: NoQuery }, ({ params }) => roleView(db(), params.id) ?? (() => { throw new NotFound(`unknown role ${params.id}`); })()),
  'GET /api/roles/:id/diff': defineRoute({ method: 'GET', pattern: '/api/roles/:id/diff', params: roleParams, query: DiffQuery }, ({ params, query }) =>
    (query.from && query.to ? diff(db(), params.id, query.from, query.to) : matrix(db(), params.id))),
  'GET /api/roles/:id/pipeline': defineRoute({ method: 'GET', pattern: '/api/roles/:id/pipeline', params: roleParams, query: NoQuery }, ({ params }) => listCandidates(db(), params.id)),
  'GET /api/stages': defineRoute({ method: 'GET', pattern: '/api/stages', query: StagesQuery }, ({ query }) => stagesView(db(), (query.source ?? null) as any)),
  'POST /api/candidates/:id/move': defineRoute({ method: 'POST', pattern: '/api/candidates/:id/move', params: idParams, query: NoQuery, body: MoveBody }, ({ params, body }) => moveCandidate(db(), params.id, body.to)),
  'POST /api/proposals/:id/approve': defineRoute({ method: 'POST', pattern: '/api/proposals/:id/approve', params: idParams, query: NoQuery, body: ApproveBody }, ({ params, body }) => approveProposal(db(), params.id, body.by || ME)),
  'POST /api/proposals/:id/reject': defineRoute({ method: 'POST', pattern: '/api/proposals/:id/reject', params: idParams, query: NoQuery, body: RejectBody }, ({ params, body }) => rejectProposal(db(), params.id, body.by || ME, body.reason)),
  'POST /api/reviews/:id/approve': defineRoute({ method: 'POST', pattern: '/api/reviews/:id/approve', params: idParams, query: NoQuery, body: ApproveBody }, ({ params, body }) => approveReview(db(), params.id, body.by || ME)),
  'POST /api/reviews/:id/reject': defineRoute({ method: 'POST', pattern: '/api/reviews/:id/reject', params: idParams, query: NoQuery, body: RejectBody }, ({ params, body }) => rejectReview(db(), params.id, body.by || ME, body.reason)),
  'POST /api/items/:id/complete': defineRoute({ method: 'POST', pattern: '/api/items/:id/complete', params: idParams, query: NoQuery, body: CompleteBody }, async ({ params, body }) => {
    const who = body.recruiter || ME;
    const r: any = completeItem(db(), params.id, who, { response: body.response, accepted: body.accepted, none_needed: body.none_needed });
    if (r.passed && !r.already) {
      // Advisory coaching: a failed or refused answer never undoes the completion (the error is stored in the result).
      const ai = await withSpan('llm', 'feedback', { purpose: 'feedback', model: getAssistModel().name }, () => studyFeedback(db(), getAssistModel(), params.id, who));
      if (ai) r.result = { ...r.result, ai };
    }
    return r;
  }),
  'POST /api/roles/:id/ask': defineRoute({ method: 'POST', pattern: '/api/roles/:id/ask', params: roleParams, query: NoQuery, body: AskBody }, ({ params, body }) =>
    withSpan('llm', 'ask', { purpose: 'ask', model: getAssistModel().name }, () => askRole(db(), getAssistModel(), params.id, body))),
} as const;
void none; void emptyBody;

export type RouteKey = keyof typeof ROUTES;

/** Unknown API paths (and methods the catch-all exports) get the contract's 404, with a trace. */
export async function apiNotFound(req: Request): Promise<Response> {
  let res!: Response;
  await withTrace({ kind: 'http', name: `${req.method} /api/*`, attrs: { method: req.method, route: '/api/*' } }, async (traceId) => {
    const path = new URL(req.url).pathname.slice(0, 120);
    res = respond(404, errorBody('not_found', `no route ${req.method} ${path}`, traceId), traceId);
    setTraceAttrs({ status: 404 });
  });
  return res;
}

// ---- in-process dispatch, used by tests (and nothing else) -----------------------------------------------------
const compiled = (Object.keys(ROUTES) as RouteKey[]).map((key) => {
  const [method, pattern] = key.split(' ') as [string, string];
  return { key, method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`) };
});

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const hits = compiled.filter((c) => c.re.test(url.pathname));
  const hit = hits.find((c) => c.method === req.method);
  if (hit) return ROUTES[hit.key](req, { params: { ...hit.re.exec(url.pathname)!.groups } });
  if (hits.length) return new Response(null, { status: 405 }); // what Next does for a method a route does not export
  return apiNotFound(req);
}

export { AppError };
