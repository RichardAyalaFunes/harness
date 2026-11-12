// Test shim: serves the SAME route table the Next app uses (lib/api/routes.ts) over node:http, bound to the database the test
// built. It stands in for a same-origin browser, so it adds Sec-Fetch-Site: same-origin when a client sends no Origin.
// Static files do not exist here (Next serves pages); anything outside /api answers 404.
import http from 'node:http';
import { dispatch } from '../../lib/api/routes.ts';

export function createApp(db: any): http.Server {
  const file = db.prepare('PRAGMA database_list').all().find((r: any) => r.name === 'main')?.file;
  if (file) process.env.HARNESS_DB = file;
  return http.createServer(async (nodeReq, nodeRes) => {
    const chunks: Buffer[] = [];
    for await (const c of nodeReq) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(nodeReq.headers)) if (typeof v === 'string') headers.set(k, v);
    if (!headers.has('origin') && !headers.has('sec-fetch-site')) headers.set('sec-fetch-site', 'same-origin');
    const url = `http://${nodeReq.headers.host}${nodeReq.url}`;
    let res: Response;
    if (!nodeReq.url!.startsWith('/api/')) res = new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 });
    else res = await dispatch(new Request(url, { method: nodeReq.method, headers, body: ['GET', 'HEAD'].includes(nodeReq.method!) || !chunks.length ? undefined : Buffer.concat(chunks) }));
    nodeRes.writeHead(res.status, Object.fromEntries(res.headers));
    nodeRes.end(Buffer.from(await res.arrayBuffer()));
  });
}
