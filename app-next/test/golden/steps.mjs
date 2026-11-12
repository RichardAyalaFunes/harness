// Scripted workflows for the golden capture. Plain data (method, path, body, headers) so the same steps can later be
// replayed against the Next.js app. Ids are literal: the replay rebuild is deterministic (see test/mock-data.test.js).
// Facts used: proposal 6 (ks-04, role ks-fe) is the only pending proposal and contains a biased restriction; both
// screening reviews (1, 2) are already approved; item 5 is a study item (role nw-be); candidates 1-7 belong to nw-be.
const get = (name, p) => ({ name, path: p });
const post = (name, p, body, extra = {}) => ({ name, method: 'POST', path: p, body, ...extra });
const LONG_ANSWER = 'I would ask the candidate to walk me through an incident they owned end to end, then probe the on-call handover.';

export const SCENARIOS = [
  {
    id: 'reads',
    description: 'Every GET endpoint on the freshly rebuilt demo database.',
    steps: [
      get('me', '/api/me'),
      get('positions', '/api/positions'),
      get('role nw-be', '/api/roles/nw-be'),
      get('role nw-ai', '/api/roles/nw-ai'),
      get('role ks-fe', '/api/roles/ks-fe'),
      get('unknown role', '/api/roles/nope'),
      get('version matrix', '/api/roles/nw-be/diff'),
      get('diff 1 to 2', '/api/roles/nw-be/diff?from=1&to=2'),
      get('diff with only one end', '/api/roles/nw-be/diff?from=1'),
      get('diff non numeric', '/api/roles/nw-be/diff?from=a&to=b'),
      get('pipeline nw-be', '/api/roles/nw-be/pipeline'),
      get('pipeline unknown role', '/api/roles/nope/pipeline'),
      get('stages all', '/api/stages'),
      get('stages for one source', '/api/stages?source=nw-08'),
      get('stages unknown source', '/api/stages?source=zz-99'),
    ],
  },
  {
    id: 'approvals',
    description: 'Approve the pending proposal (it contains a biased restriction), then repeat and mis-target approvals.',
    steps: [
      post('approve proposal 6', '/api/proposals/6/approve', {}),
      get('role ks-fe after approve', '/api/roles/ks-fe'),
      post('approve proposal 6 again', '/api/proposals/6/approve', {}),
      post('approve unknown proposal', '/api/proposals/999/approve', {}),
      post('approve non numeric id', '/api/proposals/abc/approve', {}),
      post('approve review 1 (already approved)', '/api/reviews/1/approve', {}),
      post('reject review 2 (already approved)', '/api/reviews/2/reject', { reason: 'not useful for the team at all' }),
      post('approve with explicit approver', '/api/proposals/6/approve', { by: 'luis' }),
    ],
  },
  {
    id: 'reject-short-reason',
    description: 'Reject the pending proposal with a 2-character reason (the old server does not enforce a minimum), then repeat.',
    steps: [
      post('reject with too short a reason', '/api/proposals/6/reject', { reason: 'no' }),
      post('reject again', '/api/proposals/6/reject', { reason: 'The client contradicted this in the follow-up call.' }),
      get('role ks-fe after reject', '/api/roles/ks-fe'),
    ],
  },
  {
    id: 'reject-default-reason',
    description: 'Reject the pending proposal with no body (the server fills in a default reason).',
    steps: [post('reject with no body', '/api/proposals/6/reject', {})],
  },
  {
    id: 'reject-valid-reason',
    description: 'Reject the pending proposal with a valid reason.',
    steps: [
      post('reject with a valid reason', '/api/proposals/6/reject', { reason: 'The client contradicted this in the follow-up call.' }),
      get('role ks-fe after reject', '/api/roles/ks-fe'),
    ],
  },
  {
    id: 'candidates',
    description: 'Move candidates between pipeline stages, including invalid moves.',
    steps: [
      post('move 1 to stage 1', '/api/candidates/1/move', { to: 1 }),
      get('pipeline nw-be after move', '/api/roles/nw-be/pipeline'),
      post('move 1 to stage 99', '/api/candidates/1/move', { to: 99 }),
      post('move 1 to stage -1', '/api/candidates/1/move', { to: -1 }),
      post('move 1 with no target', '/api/candidates/1/move', {}),
      post('move 1 with a string target', '/api/candidates/1/move', { to: 'two' }),
      post('move an unknown candidate', '/api/candidates/999/move', { to: 1 }),
    ],
  },
  {
    id: 'learning',
    description: 'Complete study and confirm items: blocked and accepted answers, repeats, wrong ids. Study feedback is the replay stub.',
    steps: [
      post('study with no answer', '/api/items/5/complete', {}),
      post('study with a too short answer', '/api/items/5/complete', { response: 'ok' }),
      post('study with a valid answer', '/api/items/5/complete', { response: LONG_ANSWER }),
      post('study again', '/api/items/5/complete', { response: LONG_ANSWER }),
      post('confirm item 6', '/api/items/6/complete', {}),
      post('review item with nothing accepted', '/api/items/25/complete', {}),
      post('review item none needed', '/api/items/25/complete', { none_needed: true }),
      post('unknown item', '/api/items/999/complete', {}),
      post('other recruiter completes item 23', '/api/items/23/complete', { recruiter: 'luis', response: LONG_ANSWER }),
      get('positions after completions', '/api/positions'),
      get('role nw-be after completions', '/api/roles/nw-be'),
    ],
  },
  {
    id: 'ask',
    description: 'Ask about this role: validation errors and a valid question (replay stub answer).',
    steps: [
      post('empty question', '/api/roles/nw-ai/ask', {}),
      post('too short a question', '/api/roles/nw-ai/ask', { question: 'a' }),
      post('too long a question', '/api/roles/nw-ai/ask', { question: 'x'.repeat(501) }),
      post('valid question', '/api/roles/nw-ai/ask', { question: 'What is LangGraph and what should I check for it?' }),
      post('valid question with history', '/api/roles/nw-ai/ask', { question: 'And why does the client care?', history: [{ role: 'user', content: 'What is LangGraph?' }, { role: 'assistant', content: 'stub' }, { role: 'system', content: 'ignored' }] }),
      post('unknown role', '/api/roles/nope/ask', { question: 'What is the budget?' }),
    ],
  },
  {
    id: 'http-edges',
    description: 'Malformed input, size limit, origin check, methods, static files and path traversal.',
    steps: [
      post('malformed JSON', '/api/proposals/6/approve', undefined, { raw: '{"by": ', noDb: true }),
      { name: 'body over 1 MB', method: 'POST', path: '/api/proposals/6/approve', raw: JSON.stringify({ pad: 'x'.repeat(1_100_000) }), noDb: true },
      post('cross-origin POST', '/api/proposals/6/approve', {}, { headers: { origin: 'http://evil.example' } }),
      post('same-origin POST (Origin header matches Host)', '/api/roles/nw-ai/ask', { question: 'Which tools does the client use?' }, { headers: { origin: 'http://__HOST__' } }),
      post('POST without Origin', '/api/roles/nw-ai/ask', { question: 'Which tools does the client use?' }),
      { name: 'DELETE on an API route', method: 'DELETE', path: '/api/proposals/6', noDb: true },
      get('unknown API path', '/api/does/not/exist'),
      { name: 'POST to a page', method: 'POST', path: '/', body: {}, noDb: true },
      { name: 'index page headers', path: '/', bodyHash: true, noDb: true },
      { name: 'unknown static file', path: '/nope.js', noDb: true },
      { name: 'path traversal', path: '/..%2f..%2fpackage.json', noDb: true },
    ],
  },
];
