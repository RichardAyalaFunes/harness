// Web UI: renders from the JSON API. All text is inserted with text nodes / textContent, never innerHTML.
const $ = (id) => document.getElementById(id);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => (d ? `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');
const AV = ['#7d9cc6', '#c9a24d', '#8a7fb8', '#5f9f8a', '#c27c6b', '#6c8296'];

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'type', 'placeholder', 'rows', 'open', 'id', 'title'].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = (x) => { if (x == null || x === false) return; if (Array.isArray(x)) x.forEach(add); else e.append(x.nodeType ? x : document.createTextNode(String(x))); };
  kids.forEach(add);
  return e;
}
const chip = (text, cls = 'g') => h('span', { class: `chip ${cls}` }, text);

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
let toastTimer;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg; t.style.background = bad ? '#fbe1e6' : ''; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 4500);
}
$('pop-ok').addEventListener('click', () => $('pop').classList.remove('on'));
$('nav-pos').addEventListener('click', () => { location.hash = '#/'; });

// ---- routing ----
const state = { open: {}, tab: null };
function route() {
  const m = location.hash.match(/^#\/role\/([\w-]+)(?:\/(\w+))?/);
  return m ? { role: m[1], tab: m[2] || 'pipeline' } : { role: null };
}
async function render() {
  const r = route();
  const main = $('main');
  try {
    const view = r.role ? await roleScreen(r.role, r.tab) : await positionsScreen();
    main.replaceChildren(banner(), view);
  } catch (e) {
    main.replaceChildren(h('div', { class: 'errbox', role: 'alert' }, `Could not load: ${e.message}`));
  }
}
window.addEventListener('hashchange', render);
const rerender = () => render();
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); await render(); return r; }
  catch (e) { toast(e.message, true); await render(); }
}
const banner = () => h('div', { class: 'glass banner' }, h('b', null, 'Replay model. '), 'The data below is produced by the real pipeline and checks from hand-authored model outputs. It demonstrates orchestration and checks, not extraction quality. Fictional clients and people.');

// ---- positions ----
async function positionsScreen() {
  const pos = await api('/api/positions');
  const total = pos.reduce((n, p) => n + p.pending_proposals + p.pending_reviews, 0);
  return h('div', null,
    h('div', { class: 'topbar' }, h('div', null, h('p', { class: 'h1' }, 'Hi Ana'), h('div', { class: 'title' }, 'Positions')), h('div', { class: 'grow' })),
    h('p', { class: 'sub' }, total ? `${total} change${total > 1 ? 's' : ''} awaiting approval across your positions.` : 'Nothing awaiting approval.'),
    h('div', { class: 'cards' }, pos.map((p) => h('button', { class: 'glass pos', onclick: () => { location.hash = `#/role/${p.id}/pipeline`; }, 'aria-label': `Open ${p.title} at ${p.client.name}` },
      h('div', { class: 'co' }, p.client.name), h('h3', null, p.title),
      h('div', { class: 'chips' }, chip(p.version ? `Brief v${p.version}` : 'No brief yet', 'k'),
        (p.pending_proposals + p.pending_reviews) ? chip(`${p.pending_proposals + p.pending_reviews} awaiting approval`, 'y') : chip('Nothing pending', 'g')),
      h('div', { class: 'stats' },
        h('div', { class: 'tile stat' }, h('small', null, 'Team up to date'), h('b', null, `${p.team.up_to_date} of ${p.team.total}`)),
        h('div', { class: 'tile stat' }, h('small', null, 'Candidates'), h('b', null, p.candidates.total))),
      h('div', { class: 'minibars' }, ['Sourced', 'Screening', 'Client', 'Interview', 'Offer'].map((s, i) => h('span', null, h('b', null, p.candidates.by_stage[i]), s)))))));
}

// ---- role page ----
async function roleScreen(roleId, tab) {
  const [d, cands] = await Promise.all([api(`/api/roles/${roleId}`), api(`/api/roles/${roleId}/pipeline`)]);
  const pend = d.proposals.filter((p) => p.state === 'proposed').length + d.reviews.filter((r) => r.state === 'proposed').length;
  const myPending = d.items.filter((i) => !i.completion).length;
  const lead = d.team.find((t) => t.id === d.role.lead);
  const tabs = [['pipeline', 'Pipeline', false], ['brief', 'Role brief', false], ['changes', 'Changes', pend > 0], ['current', 'Stay current', myPending > 0]];
  const body = { pipeline: () => pipelineTab(d, cands), brief: () => briefTab(d), changes: () => changesTab(d), current: () => currentTab(d) }[tab] || (() => pipelineTab(d, cands));
  return h('div', null,
    h('div', { class: 'crumb' }, h('button', { onclick: () => { location.hash = '#/'; } }, 'Positions'), ' / ', d.role.client.name),
    h('section', { class: 'glass hero' },
      h('div', null, h('div', { class: 'title' }, d.role.title), h('p', { class: 'sub' }, `${d.role.client.name} · lead recruiter ${lead ? lead.name : d.role.lead}`),
        h('div', { class: 'chips' }, chip(d.brief ? `Brief v${d.brief.version}` : 'No approved brief', 'k'), pend ? chip(`${pend} awaiting approval`, 'y') : null)),
      h('div', { class: 'kpis' },
        kpi('Candidates', cands.length), kpi('Brief version', d.brief ? `v${d.brief.version}` : '-'), kpi('Awaiting approval', pend),
        kpi('Team up to date', `${d.team.filter((t) => t.up_to_date).length} of ${d.team.length}`))),
    h('div', { class: 'glass seg', role: 'tablist' }, tabs.map(([id, label, dot]) => h('button', { role: 'tab', 'aria-selected': String(id === tab), class: id === tab ? 'on' : '', onclick: () => { location.hash = `#/role/${roleId}/${id}`; } }, label, dot ? h('span', { class: 'n', title: 'needs attention' }) : null))),
    body());
}
const kpi = (label, v) => h('div', { class: 'tile kpi' }, h('small', null, label), h('b', null, v));

// Pipeline: moves are never gated by learning data.
function pipelineTab(d, cands) {
  return h('div', null,
    h('p', { class: 'sub' }, 'Moving a candidate is never blocked by the learning steps. Applied restrictions are shown in the brief only and do not filter candidates.'),
    h('div', { class: 'board' }, d.stages.map((s, i) => h('section', { class: 'glass col', 'aria-label': s },
      h('h4', null, s, h('span', null, cands.filter((c) => c.stage === i).length)),
      cands.filter((c) => c.stage === i).map((c) => h('div', { class: 'tile cand' },
        h('div', { class: 'who' }, h('div', { class: 'av', style: `background:${AV[c.id % AV.length]}` }, c.name.split(/[ .]+/).map((x) => x[0]).slice(0, 2).join('')), h('div', null, h('b', null, c.name), h('small', null, s))),
        i < d.stages.length - 1 ? h('button', { class: 'mv', 'aria-label': `Move ${c.name} to ${d.stages[i + 1]}`, onclick: () => act(() => api(`/api/candidates/${c.id}/move`, { to: i + 1 }), `${c.name} moved to ${d.stages[i + 1]}`) }, 'Next stage →') : null))))));
}

// ---- brief ----
const weightChip = (w) => ({ must: chip('Must-have', 'k'), trainable: chip('Trainable', 'ys'), nice: chip('Nice to have', 'g'), proposed: chip('Proposed, not confirmed by client', 'ys') }[w] || null);
function statusChips(f) {
  return [f.status === 'applied' ? chip('Applied (shown here only)', 'g') : null,
    f.status === 'not_applied_bias' ? chip(`Not applied · possible bias (${f.bias ? f.bias.kind : '?'})`, 'r') : null,
    f.status === 'pending' ? chip('Pending clarification', 'ys') : null,
    f.confirmed === false ? chip('Not confirmed by client', 'ys') : null, weightChip(f.weight)];
}
function briefTab(d) {
  if (!d.brief) return h('div', { class: 'glass panel' }, 'No approved brief yet. Approve a proposal in Changes.');
  const groups = [...new Set(d.brief.fields.map((f) => f.group))];
  return h('div', { class: 'two' },
    h('div', { class: 'glass panel' }, h('h3', null, `Role brief v${d.brief.version}`), h('p', { class: 'sub' }, `Current approved version, from ${d.brief.source_id}, ${fmtDate(d.brief.effective_date)}. Highlighted rows changed in this version.`),
      groups.map((g) => h('div', null, h('span', { class: 'grp' }, g),
        h('div', { class: 'rows' }, d.brief.fields.filter((f) => f.group === g).map((f) => h('div', { class: `r${f.changed_in_version === d.brief.version ? ' chg' : ''}` },
          h('div', { class: 'k' }, f.label), h('div', { class: 'v' }, f.value, h('div', { class: 'chips' }, statusChips(f)),
            f.bias ? h('small', null, f.bias.note) : null, h('small', null, `${f.source_id} · “${f.quote}”`)))))))),
    h('div', null, h('div', { class: 'glass panel' }, h('h3', null, 'Versions'), h('ul', { class: 'list' }, d.versions.slice().reverse().map((v) => h('li', null, h('span', { class: 'num' }, `v${v.n}`), h('div', null, v.source_id, h('small', null, fmtDate(v.effective_date))))))),
      verifyPanel(d)));
}
function verifyPanel(d) {
  return h('div', { class: 'glass panel' }, h('h3', null, 'What to verify in screenings'),
    h('p', { class: 'sub' }, 'Informational. It never blocks moving a candidate.'),
    h('span', { class: 'grp' }, 'Current must-haves'),
    h('ul', { class: 'list' }, d.verify.musts.length ? d.verify.musts.map((m) => h('li', null, h('span', { class: 'num' }, '✓'), h('div', null, m.label, h('small', null, m.value)))) : h('li', null, 'No must-haves yet.')),
    d.verify.suggestions.length ? h('span', { class: 'grp' }, 'From approved client-decision reviews') : null,
    h('ul', { class: 'list' }, d.verify.suggestions.map((s) => h('li', null, h('span', { class: 'num' }, '?'), h('div', null, s.text, h('small', null, `${s.why} (${s.source_id})`))))));
}

// ---- changes ----
const sevChip = (s) => chip(s, s === 'critical' ? 'r' : s === 'material' ? 'y' : 'g');
const stateChip = (s) => ({ proposed: chip('Awaiting approval', 'y'), approved: chip('Approved', 'ok'), rejected: chip('Rejected', 'r'), superseded: chip('Superseded by a changed file', 'g'), superseded_noop: chip('Superseded: nothing material left after rebase', 'g') }[s] || chip(s));
function changeBox(c) {
  const shown = c.op === 'remove' ? 'removed' : c.value;
  return h('div', { class: `cg${c.bias ? ' bias' : ''}` },
    h('b', null, c.label), ' ', h('span', null, c.old ? `${c.old} → ${shown}` : `→ ${shown}`), ' ', sevChip(c.severity), ' ', weightChip(c.weight),
    c.status === 'applied' ? chip('applied, shown in brief only', 'g') : null,
    c.status === 'not_applied_bias' ? chip(`NOT APPLIED · possible bias (${c.bias ? c.bias.kind : '?'})`, 'r') : null,
    c.confirmed === false ? chip('not confirmed', 'ys') : null, c.conflicts_with ? chip(`conflicts with ${c.conflicts_with}`, 'r') : null,
    c.bias ? h('div', { class: 'q' }, c.bias.note) : null, h('div', { class: 'q' }, `“${c.quote}”`));
}
function decisionActs(kind, id, ready) {
  const reason = h('input', { type: 'text', placeholder: 'Reason for rejecting', 'aria-label': 'Reason for rejecting' });
  return h('div', { class: 'acts' },
    h('button', { class: 'pill dark', disabled: !ready, onclick: () => act(() => api(`/api/${kind}/${id}/approve`, {}), 'Approved') }, 'Approve'),
    reason, h('button', { class: 'pill light', onclick: () => (reason.value.trim() ? act(() => api(`/api/${kind}/${id}/reject`, { reason: reason.value.trim() }), 'Rejected, kept for audit') : toast('Write a reason first', true)) }, 'Reject'),
    ready ? null : chip('processing failed: see how this was processed', 'r'));
}
function proposalCard(p) {
  return h('article', { class: 'glass prop' },
    h('div', { class: 'head' }, h('h4', null, `Proposal #${p.id}`), stateChip(p.state), sevChip(p.severity), p.kind === 'manual-correction' ? chip(`manual correction of #${p.corrects}`, 'b') : null,
      p.version_created ? chip(`created v${p.version_created}`, 'k') : null),
    h('p', { class: 'sub' }, `From ${p.source_id} · ${p.title} · ${fmtDate(p.date)}${p.decided_by ? ` · decided by ${p.decided_by}` : ''}${p.reason ? ` · ${p.reason}` : ''}`),
    p.changes.map(changeBox), p.state === 'proposed' ? decisionActs('proposals', p.id, p.ready) : null);
}
const COV = { asked: ['Asked', 'ok'], briefly: ['Only briefly', 'ys'], not_asked: ['Not asked', 'r'], not_applicable_historical: ['Added later, not a gap', 'b'] };
function reviewCard(r, d) {
  const label = (c) => (d.matrix.rows.find((x) => x.field === c) || {}).label || c;
  return h('article', { class: 'glass prop' },
    h('div', { class: 'head' }, h('h4', null, `Client decision: ${r.candidate} ${r.decision.outcome}`), stateChip(r.state), r.status === 'insufficient_evidence' ? chip('Insufficient evidence', 'y') : chip(`reviewed against v${r.brief_version_at_screening} (brief at the screening)`, 'g')),
    h('p', { class: 'sub' }, `${r.source_id} · ${fmtDate(r.date)} · client reason: ${r.decision.reason}. Retrospective: it coaches future screenings and does not re-score the candidate.${r.decided_by ? ` Decided by ${r.decided_by}.` : ''}`),
    r.status === 'insufficient_evidence' ? h('div', { class: 'cg' }, `No screening transcript for ${r.candidate} on this role was found dated on or before the decision. Nothing can be judged yet: add screening notes.`) : null,
    r.coverage.length ? h('ul', { class: 'list cov' }, r.coverage.map((c) => h('li', null, chip(COV[c.status][0], COV[c.status][1]), h('div', null, label(c.criterion), c.quote ? h('small', null, `“${c.quote}” (${r.screening_source_id})`) : null)))) : null,
    r.overweighted.map((o) => h('div', { class: 'cg' }, h('b', null, 'Over-weighted: '), `${o.topic}, ${o.count} of ${o.total} questions`, h('div', { class: 'q' }, `“${o.quote}”`))),
    r.suggested.length ? h('div', null, h('span', { class: 'grp' }, 'Suggested for future screenings'), h('ul', { class: 'list' }, r.suggested.map((s) => h('li', null, h('span', { class: 'num' }, '→'), h('div', null, s.text, h('small', null, s.why)))))) : null,
    r.state === 'proposed' ? decisionActs('reviews', r.id, r.ready) : null);
}
const OUT = (o) => ({ version: chip(`→ brief v${o.version}`, 'k'), proposed: chip('proposal awaiting approval', 'y'), rejected: chip('proposal rejected', 'r'), no_version: chip('no new version', 'g'), failed: chip(`processing failed at stage ${o.stage}`, 'r'), not_processed: chip('not processed yet', 'y'), superseded: chip('superseded', 'g') }[o.kind]);
function stagesTable(rows) {
  return h('table', { class: 'stg' }, h('thead', null, h('tr', null, ['Stage', 'Result', 'Check / reason'].map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r) => h('tr', null, h('td', null, `${r.stage}. ${r.name}`),
      h('td', null, chip(r.status === 'passed' ? '✓ passed' : r.status === 'failed' ? '✗ failed' : r.status === 'skipped' ? '– skipped' : '… pending', r.status === 'passed' ? 'ok' : r.status === 'failed' ? 'r' : 'g')),
      h('td', null, r.skip_reason ? h('span', null, `Skipped: ${r.skip_reason}`) : null, h('code', null, r.check ? JSON.stringify(r.check, null, 1) : ''))))));
}
function howProcessed(s) {
  const box = h('div', null);
  const det = h('details', { class: 'how', open: !!state.open[s.source_id] }, h('summary', null, 'How this was processed'), box);
  det.addEventListener('toggle', async () => {
    state.open[s.source_id] = det.open;
    if (det.open && !box.childNodes.length) {
      try { box.replaceChildren(stagesTable(await api(`/api/stages?source=${encodeURIComponent(s.source_id)}`)), h('p', { class: 'stubnote' }, 'Each stage has an acceptance check; a stage counts only when its check passed and the result is stored.')); }
      catch (e) { box.replaceChildren(`Could not load: ${e.message}`); }
    }
  });
  if (det.open) det.dispatchEvent(new Event('toggle'));
  return det;
}
function matrixTable(m) {
  const groups = [...new Set(m.rows.map((r) => r.group))];
  return h('div', { class: 'cmpwrap' }, h('table', { class: 'cmp' },
    h('thead', null, h('tr', null, h('th', null, 'Field'), m.versions.map((v) => h('th', null, h('b', null, `v${v.n}`), `${v.source_id} · ${fmtDate(v.date)}`)))),
    h('tbody', null, groups.flatMap((g) => [h('tr', null, h('td', { colspan: m.versions.length + 1 }, h('span', { class: 'grp' }, g))),
      ...m.rows.filter((r) => r.group === g).map((r) => h('tr', null, h('td', null, r.label),
        r.cells.map((c, i) => (c.empty ? h('td', { class: 'empty' }, '—') : (!c.changed && i > 0 ? h('td', { class: 'same' }, '=') : h('td', { class: `cell${c.changed ? ' c' : ''}` }, c.value, h('small', null, [c.weight, c.status === 'not_applied_bias' ? '⚑ not applied' : c.status].filter(Boolean).join(' · '))))))))]))));
}
function changesTab(d) {
  const open = d.proposals.filter((p) => p.state === 'proposed');
  const openRev = d.reviews.filter((r) => r.state === 'proposed');
  const hist = d.proposals.filter((p) => p.state !== 'proposed');
  const histRev = d.reviews.filter((r) => r.state !== 'proposed');
  return h('div', null,
    h('div', { class: 'sechead' }, h('h3', null, 'Awaiting approval'), chip(open.length + openRev.length, open.length + openRev.length ? 'y' : 'g')),
    open.length + openRev.length ? [open.map(proposalCard), openRev.map((r) => reviewCard(r, d))] : h('p', { class: 'sub' }, 'No changes are waiting for approval.'),
    h('div', { class: 'glass panel' }, h('h3', null, 'Timeline of sources'), h('p', { class: 'sub' }, 'Every source received for this position (and its client), what it changed, and how it was processed.'),
      h('ul', { class: 'tlist' }, d.timeline.map((s) => h('li', null, h('div', { class: 'd' }, fmtDate(s.date), h('br'), s.channel), h('div', null,
        h('div', { class: 't' }, s.title, ' ', OUT(s.outcome), s.decision ? chip(`client: ${s.decision.candidate} ${s.decision.outcome}`, 'b') : null, s.review_state ? chip(`review ${s.review_state}`, s.review_state === 'approved' ? 'ok' : s.review_state === 'rejected' ? 'r' : 'y') : null),
        h('div', { class: 's' }, s.summary || 'No analysis yet.'), howProcessed(s)))))),
    h('div', { class: 'glass panel' }, h('h3', null, 'Compare versions'), h('p', { class: 'sub' }, 'Highlighted cells changed from the previous version; = means unchanged.'), d.matrix.versions.length ? matrixTable(d.matrix) : 'No versions yet.'),
    hist.length + histRev.length ? h('div', null, h('div', { class: 'sechead' }, h('h3', null, 'Decided proposals and client decisions')), hist.map(proposalCard), histRev.map((r) => reviewCard(r, d))) : null);
}

// ---- stay current ----
function ackItem(it, d) {
  return itemShell(it, [h('div', { class: 'was' }, it.detail.was ? h('small', null, `was: ${it.detail.was}`) : null), it.detail.note ? h('p', { class: 'sub' }, it.detail.note) : null,
    it.completion ? null : h('button', { class: 'pill dark', onclick: () => act(() => api(`/api/items/${it.id}/complete`, { recruiter: d.me }), 'Confirmed') }, 'I have read and understood this')]);
}
function studyItem(it, d) {
  const ta = h('textarea', { rows: 4, 'aria-label': `Your answer: ${it.title}`, placeholder: 'Answer in your own words (at least 20 characters)', value: it.completion ? it.completion.response || '' : '', disabled: !!it.completion });
  const result = h('div', { class: 'fb', hidden: true });
  const res = it.completion ? it.completion.result : null;
  const showRes = (r) => { result.hidden = false; result.replaceChildren(h('b', { class: r.passed ? 'ok' : 'bad' }, r.passed ? 'Answer recorded. ' : `Not recorded yet: ${r.rule}. `), r.points ? r.points.map((p) => h('div', { class: `pt${p.hit ? ' y' : ''}` }, p.hit ? '✓' : '○', ' ', p.text)) : null, r.note ? h('p', { class: 'stubnote' }, `Replay stub: ${r.note}`) : null); };
  if (res) showRes(res);
  return itemShell(it, [h('p', { class: 'prompt' }, it.detail.prompt), h('div', { class: 'answer' }, ta, h('button', { class: 'micb', 'aria-label': 'Record audio answer (not available in this MVP)', onclick: () => $('pop').classList.add('on') }, '🎙')), result,
    it.completion ? null : h('div', { class: 'acts' }, h('button', { class: 'pill dark', onclick: async () => {
      try { const r = await api(`/api/items/${it.id}/complete`, { recruiter: d.me, response: ta.value }); if (r.passed) { toast('Answer recorded'); await render(); } else showRes(r.result); }
      catch (e) { toast(e.message, true); }
    } }, 'Submit answer'))]);
}
function reviewItem(it, d) {
  const boxes = (it.detail.suggested || []).map((s, i) => ({ s, i, cb: h('input', { type: 'checkbox', checked: !!(it.completion && (it.completion.accepted || []).includes(i)), disabled: !!it.completion }) }));
  const none = h('input', { type: 'checkbox', disabled: !!it.completion });
  const why = h('input', { type: 'text', placeholder: 'Why none is needed', 'aria-label': 'Why none is needed', disabled: !!it.completion });
  return itemShell(it, [h('p', { class: 'sub' }, `Client said: ${it.detail.reason}`), it.detail.note ? h('div', { class: 'cg' }, it.detail.note) : null,
    boxes.map(({ s, cb }) => h('label', { class: 'chk' }, cb, h('span', null, s.text, h('br'), h('small', null, s.why)))),
    h('label', { class: 'chk' }, none, h('span', null, 'None of these is needed')), why,
    it.completion ? null : h('div', { class: 'acts' }, h('button', { class: 'pill dark', onclick: async () => {
      try {
        const accepted = boxes.filter((b) => b.cb.checked).map((b) => b.i);
        const r = await api(`/api/items/${it.id}/complete`, { recruiter: d.me, accepted, none_needed: none.checked, response: why.value });
        if (r.passed) { toast('Review recorded'); await render(); } else toast(`Not recorded: ${r.result.rule}`, true);
      } catch (e) { toast(e.message, true); }
    } }, 'Accept review'))]);
}
function itemShell(it, kids) {
  return h('article', { class: `glass item${it.completion ? ' done' : ''}` }, h('div', { class: 'top' }, h('b', null, it.title), it.completion ? chip('✓ Done', 'ok') : chip('To do', 'y')),
    h('small', null, `${it.source_id}${it.version ? ` · brief v${it.version}` : ''}`), kids);
}
function currentTab(d) {
  const by = (k) => d.items.filter((i) => i.kind === k);
  const sec = (title, sub, k, fn) => (by(k).length ? h('div', null, h('div', { class: 'sechead' }, h('h3', null, title), h('span', { class: 'sub' }, `${by(k).filter((i) => i.completion).length} of ${by(k).length} done · ${sub}`)), by(k).map((i) => fn(i, d))) : null);
  return h('div', { class: 'two' },
    h('div', null,
      h('div', { class: 'glass panel' }, h('h3', null, 'Stay current'), h('p', { class: 'sub' }, `You have completed ${d.my_progress.done} of ${d.my_progress.total} items for this position. Only approved changes appear here.`)),
      d.items.length ? null : h('p', { class: 'sub' }, 'Nothing to learn yet: no approved change has created a step.'),
      sec('Confirm', 'read and acknowledge', 'ack', ackItem), sec('Study', 'write what you would do', 'study', studyItem), sec('Review', 'learn from the client decision', 'review', reviewItem)),
    h('div', null, h('div', { class: 'glass panel' }, h('h3', null, 'Team'), h('p', { class: 'sub' }, 'Up to date = every published step completed with evidence.'),
      d.team.map((t) => h('div', { class: `trow${t.id === d.me ? ' me' : ''}` }, h('b', null, t.name), h('span', null, `${t.done}/${t.total}`), t.up_to_date ? chip('Up to date', 'ok') : chip(`${t.pending} to do`, 'y')))),
      verifyPanel(d)));
}

render();
