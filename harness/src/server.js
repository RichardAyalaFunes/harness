// JSON API + static web UI on node:http. Listens on 127.0.0.1 only (a local demo, no auth: the demo user is "ana").
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, ROOT, DB_PATH } from './db.js';
import { positionsView, roleView, stagesView, ME } from './views.js';
import { diff, matrix } from './brief.js';
import { listCandidates, moveCandidate } from './candidates.js';
import { approveProposal, rejectProposal, approveReview, rejectReview } from './approvals.js';
import { completeItem } from './learning.js';
import { loadEnv, getModel } from './model/index.js';
import { askRole } from './ask.js';
loadEnv();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'",
  'Cache-Control': 'no-store',
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > 1e6) throw new HttpError(413, 'body too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'body is not valid JSON'); }
}

export function createApp(db, { webDir = path.join(ROOT, 'web') } = {}) {
  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });

  route('GET', '/api/me', () => ({ id: ME }));
  route('GET', '/api/positions', () => positionsView(db));
  route('GET', '/api/roles/:id', ({ p }) => roleView(db, p.id) ?? Promise.reject(new HttpError(404, `unknown role ${p.id}`)));
  route('GET', '/api/roles/:id/diff', ({ p, q }) => (q.get('from') && q.get('to') ? diff(db, p.id, Number(q.get('from')), Number(q.get('to'))) : matrix(db, p.id)));
  route('GET', '/api/roles/:id/pipeline', ({ p }) => listCandidates(db, p.id));
  route('POST', '/api/candidates/:id/move', ({ p, body }) => moveCandidate(db, Number(p.id), body.to));
  route('POST', '/api/proposals/:id/approve', ({ p, body }) => approveProposal(db, Number(p.id), body.by || ME));
  route('POST', '/api/proposals/:id/reject', ({ p, body }) => rejectProposal(db, Number(p.id), body.by || ME, body.reason || 'rejected in the UI'));
  route('POST', '/api/reviews/:id/approve', ({ p, body }) => approveReview(db, Number(p.id), body.by || ME));
  route('POST', '/api/reviews/:id/reject', ({ p, body }) => rejectReview(db, Number(p.id), body.by || ME, body.reason || 'rejected in the UI'));
  route('POST', '/api/items/:id/complete', ({ p, body }) => completeItem(db, Number(p.id), body.recruiter || ME, { response: body.response, accepted: body.accepted, none_needed: body.none_needed }));
  route('POST', '/api/roles/:id/ask', ({ p, body }) => askRole(db, getModel(), p.id, body).catch((e) => Promise.reject(new HttpError(400, e.message))));
  route('GET', '/api/stages', ({ q }) => stagesView(db, q.get('source')));

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { ...HEADERS, 'Content-Type': type });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'cross-origin request refused');
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(url.pathname);
          if (!m) continue;
          const body = req.method === 'POST' ? await readJson(req) : {};
          return send(res, 200, await r.fn({ p: m.groups || {}, q: url.searchParams, body }));
        }
        throw new HttpError(404, `no route ${req.method} ${url.pathname}`);
      }
      if (req.method !== 'GET') throw new HttpError(405, 'method not allowed');
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(webDir, rel);
      if (!file.startsWith(path.resolve(webDir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, 'not found');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      send(res, e.status || 400, { error: e.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(DB_PATH)) { console.error(`no database at ${DB_PATH}; run "pnpm harness rebuild" first`); process.exit(1); }
  const port = Number(process.env.PORT || 3000);
  createApp(openDb()).listen(port, '127.0.0.1', () => console.log(`RadHires harness UI: http://127.0.0.1:${port}  (model: replay data, db: ${DB_PATH})`));
}
