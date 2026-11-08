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
const chip = (text, cls = 'g', tip) => h('span', { class: `chip ${cls}`, title: tip }, text);
// "?" hint: hover or keyboard focus shows a short explanation.
const hint = (text) => h('span', { class: 'hint', tabindex: '0', role: 'note', 'aria-label': text, 'data-tip': text }, '?');
const tipEl = document.body.appendChild(document.createElement('div'));
tipEl.className = 'tipfloat'; tipEl.setAttribute('aria-hidden', 'true');
function showTip(el) {
  tipEl.textContent = el.dataset.tip;
  tipEl.classList.add('on');
  const a = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - t.width - 8, a.left + a.width / 2 - t.width / 2));
  const below = a.bottom + 8 + t.height < innerHeight;
  tipEl.style.left = `${left}px`; tipEl.style.top = `${below ? a.bottom + 8 : a.top - t.height - 8}px`;
}
const hideTip = () => tipEl.classList.remove('on');
for (const [ev, fn] of [['mouseover', showTip], ['focusin', showTip]]) document.addEventListener(ev, (e) => { const el = e.target.closest?.('.hint'); if (el) fn(el); });
for (const ev of ['mouseout', 'focusout']) document.addEventListener(ev, (e) => { if (e.target.closest?.('.hint')) hideTip(); });
addEventListener('scroll', hideTip, true);
addEventListener('hashchange', hideTip);

// Smooth open/close for every <details>: height and opacity ease instead of jumping.
function animateDetails(det) {
  const sum = det.querySelector(':scope > summary');
  sum.addEventListener('click', (e) => {
    if (REDUCED.matches) return;
    e.preventDefault();
    if (det.dataset.anim) return;
    det.dataset.anim = '1';
    const start = det.offsetHeight;
    const closing = det.open;
    if (!closing) det.open = true;
    const end = closing ? sum.offsetHeight : det.scrollHeight;
    det.style.overflow = 'hidden';
    const a = det.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    let doneOnce = false;
    const fin = () => { if (doneOnce) return; doneOnce = true; a.cancel(); if (closing) det.open = false; det.style.overflow = ''; delete det.dataset.anim; };
    a.onfinish = fin; setTimeout(fin, 300);
  });
  return det;
}
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.querySelectorAll) [n, ...n.querySelectorAll('details')].forEach((d) => { if (d.tagName === 'DETAILS' && !d.dataset.wired) { d.dataset.wired = '1'; animateDetails(d); } }); })
  .observe(document.body, { childList: true, subtree: true });
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const SVGNS = 'http://www.w3.org/2000/svg';
function micIcon() {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3', 'M8 21h8']) {
    const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p);
  }
  return s;
}
// Human names for sources: "Kickoff call: AI Agent Engineer, 28 Oct" instead of internal ids.
let SRC = {};
const srcName = (id) => (SRC[id] ? `${SRC[id].title}, ${fmtDate(SRC[id].date)}` : id);

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const shake = (el) => { if (el && !REDUCED.matches) el.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 320 }); };
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
// Motion: a new screen shows a short skeleton then rises in; a new tab slides in from the side of the tab
// you clicked; re-renders after an action (same screen) do not animate. Reduced-motion users get no movement.
const TAB_ORDER = ['pipeline', 'brief', 'changes', 'current'];
const wait = (ms) => new Promise((res) => setTimeout(res, REDUCED.matches ? 0 : ms));
let last = { role: undefined, tab: undefined };
const skeleton = () => h('div', { class: 'skel', 'aria-busy': 'true', 'aria-label': 'Loading' },
  h('div', { class: 'sk sk-hero' }), h('div', { class: 'sk sk-bar' }), h('div', { class: 'skrow' }, h('div', { class: 'sk sk-card' }), h('div', { class: 'sk sk-card' }), h('div', { class: 'sk sk-card' })));
async function render() {
  const r = route();
  const main = $('main');
  const newScreen = r.role !== last.role;
  const newTab = !newScreen && r.tab !== last.tab;
  const dir = newTab ? Math.sign(TAB_ORDER.indexOf(r.tab) - TAB_ORDER.indexOf(last.tab)) : 0;
  const fromTab = last.tab;
  last = { role: r.role, tab: r.tab };
  try {
    let view;
    if (newScreen) {
      if (main.childNodes.length) main.replaceChildren(banner(), skeleton());
      [view] = await Promise.all([r.role ? roleScreen(r.role, r.tab) : positionsScreen(), wait(main.childNodes.length ? 260 : 0)]);
    } else {
      const old = main.querySelector('.view');
      if (newTab && old && !REDUCED.matches) { old.style.setProperty('--dir', dir); old.classList.add('view-out'); }
      [view] = await Promise.all([r.role ? roleScreen(r.role, r.tab) : positionsScreen(), newTab ? wait(140) : null]);
    }
    main.replaceChildren(banner(), view);
    afterRender(main);
    if (newScreen) view.classList.add('screen-in');
    const v = main.querySelector('.view');
    if (newTab && v) { v.style.setProperty('--dir', dir); v.classList.add('view-in'); }
    moveIndicator(main, newTab ? fromTab : null);
  } catch (e) {
    main.replaceChildren(h('div', { class: 'errbox', role: 'alert' }, `Could not load: ${e.message}`), h('button', { class: 'pill light', onclick: () => { last = {}; render(); } }, 'Try again'));
  }
}
// Sliding pill behind the active tab: starts under the previous tab, glides to the new one.
function moveIndicator(main, fromTab) {
  const seg = main.querySelector('.seg'); if (!seg) return;
  const ind = seg.querySelector('.ind');
  const at = (b) => { ind.style.width = `${b.offsetWidth}px`; ind.style.transform = `translateX(${b.offsetLeft}px)`; };
  const on = seg.querySelector('button.on'); if (!on) return;
  const from = fromTab && seg.querySelector(`button[data-tab="${fromTab}"]`);
  ind.style.transition = 'none';
  at(from || on);
  ind.getBoundingClientRect();
  ind.style.transition = '';
  at(on);
}
window.addEventListener('hashchange', render);
const rerender = () => render();
// Exit animation: fade, slide and collapse an element before it is removed by a re-render.
function leave(el, dir = 1) {
  if (!el || REDUCED.matches) return Promise.resolve();
  const hgt = el.offsetHeight;
  el.style.overflow = 'hidden';
  const a = el.animate([{ opacity: 1, transform: 'none', height: `${hgt}px` }, { opacity: 0, transform: `translateX(${dir * 24}px) scale(.97)`, height: `${hgt}px`, offset: 0.6 }, { opacity: 0, height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }],
    { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  // Never block on the animation (a hidden tab pauses it): continue after its duration either way.
  return Promise.race([a.finished.catch(() => {}), new Promise((res) => setTimeout(res, 360))]);
}
// opts.leave: element to animate out on success. opts.mark: [kind, id] to animate in after the re-render.
async function act(fn, okMsg, opts = {}) {
  try {
    const r = await fn();
    if (opts.leave) await leave(opts.leave, opts.dir);
    state.mark = opts.mark || null;
    if (okMsg) toast(okMsg);
    await render(); return r;
  } catch (e) { toast(e.message, true); await render(); }
}
// After a re-render: highlight what arrived or changed (moved card, completed step, numbers that changed).
state.nums = {};
function afterRender(main) {
  if (state.mark) {
    const [k, id] = state.mark;
    main.querySelector(`[data-${k}="${id}"]`)?.classList.add(k === 'item' ? 'justdone' : 'arrive');
    state.mark = null;
  }
  main.querySelectorAll('[data-num]').forEach((el) => {
    const key = `${location.hash}|${el.dataset.num}`;
    if (key in state.nums && state.nums[key] !== el.textContent) el.classList.add('bump');
    state.nums[key] = el.textContent;
  });
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
      h('div', { class: 'chips' }, !p.version ? chip('No brief yet', 'ys') : null,
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
  SRC = Object.fromEntries(d.timeline.map((s) => [s.source_id, s]));
  const tabs = [['pipeline', 'Pipeline', false, 'Candidates by stage.'], ['brief', 'Role brief', false, 'What the client needs for this role, as approved by the lead recruiter.'], ['changes', 'Changes', pend > 0, 'Everything the client sent about this role and what it changed.'], ['current', 'Stay current', myPending > 0, 'Short steps so you learn each approved change.']];
  const body = { pipeline: () => pipelineTab(d, cands), brief: () => briefTab(d), changes: () => changesTab(d), current: () => currentTab(d) }[tab] || (() => pipelineTab(d, cands));
  return h('div', null,
    h('div', { class: 'crumb' }, h('button', { onclick: () => { location.hash = '#/'; } }, 'Positions'), ' / ', d.role.client.name),
    h('section', { class: 'glass hero' },
      h('div', null, h('div', { class: 'title' }, d.role.title), h('p', { class: 'sub' }, `${d.role.client.name} · lead recruiter ${lead ? lead.name : d.role.lead}`),
        h('div', { class: 'chips' }, d.brief ? null : chip('No approved brief yet', 'ys'), pend ? chip(`${pend} awaiting approval`, 'y') : null)),
      h('div', { class: 'kpis' },
        kpi('Candidates', cands.length, 'Candidates in this position, across all pipeline stages.'),
        kpi('Awaiting approval', pend, 'Changes to the role brief, or lessons from a client decision, that the lead recruiter must approve before the team sees them.'),
        kpi('Team up to date', `${d.team.filter((t) => t.up_to_date).length} of ${d.team.length}`, 'Recruiters on this position who completed every step in Stay current.'))),
    h('div', { class: 'glass seg', role: 'tablist' }, h('span', { class: 'ind', 'aria-hidden': 'true' }), tabs.map(([id, label, dot, tip]) => h('button', { role: 'tab', 'data-tab': id, title: tip, 'aria-selected': String(id === tab), class: id === tab ? 'on' : '', onclick: () => { location.hash = `#/role/${roleId}/${id}`; } }, label, dot ? h('span', { class: 'n', title: 'needs attention' }) : null))),
    h('div', { class: 'view' }, body()));
}
const kpi = (label, v, tip) => h('div', { class: 'tile kpi' }, h('small', null, label, tip ? hint(tip) : null), h('b', { 'data-num': label }, v));

// Pipeline: moves are never gated by learning data.
function pipelineTab(d, cands) {
  return h('div', null,
    h('p', { class: 'sub' }, 'Moving a candidate is never blocked by the learning steps. Applied restrictions are shown in the brief only and do not filter candidates.'),
    h('div', { class: 'board' }, d.stages.map((s, i) => h('section', { class: 'glass col', 'aria-label': s },
      h('h4', null, s, h('span', null, cands.filter((c) => c.stage === i).length)),
      cands.filter((c) => c.stage === i).map((c) => h('div', { class: 'tile cand', 'data-cand': c.id },
        h('div', { class: 'who' }, h('div', { class: 'av', style: `background:${AV[c.id % AV.length]}` }, c.name.split(/[ .]+/).map((x) => x[0]).slice(0, 2).join('')), h('div', null, h('b', null, c.name), h('small', null, s))),
        i < d.stages.length - 1 ? h('button', { class: 'mv', 'aria-label': `Move ${c.name} to ${d.stages[i + 1]}`, onclick: (e) => act(() => api(`/api/candidates/${c.id}/move`, { to: i + 1 }), `${c.name} moved to ${d.stages[i + 1]}`, { leave: e.currentTarget.closest('.cand'), mark: ['cand', c.id] }) }, 'Next stage →') : null))))));
}

// ---- brief ----
const weightChip = (w) => ({ must: chip('Must-have', 'k', 'The client will not hire without this. Verify it in every screening.'), trainable: chip('Trainable', 'b', 'Useful, but the client will teach it on the job. Do not reject a candidate for lacking it.'), nice: chip('Nice to have', 'g', 'A plus, never a reason to reject.'), proposed: chip('Proposed, not confirmed by client', 'ys', 'Suggested internally; confirm it with the client.') }[w] || null);
function statusChips(f) {
  return [f.status === 'applied' ? chip('Applied (shown here only)', 'g') : null,
    f.status === 'not_applied_bias' ? chip(`Not applied · possible bias (${f.bias ? f.bias.kind : '?'})`, 'r') : null,
    f.status === 'pending' ? chip('Pending clarification', 'ys') : null,
    f.confirmed === false ? chip('Not confirmed by client', 'ys') : null, weightChip(f.weight)];
}
state.ver = {};
function briefTab(d) {
  if (!d.brief) return h('div', { class: 'glass panel' }, 'No approved brief yet. Approve a proposal in Changes.');
  const cur = d.brief.version;
  const sel = d.versions.find((v) => v.n === state.ver[d.role.id]) || d.versions.find((v) => v.n === cur);
  const isCur = sel.n === cur;
  const fields = isCur ? d.brief.fields : sel.fields;
  const groups = [...new Set(fields.map((f) => f.group))];
  const pick = async (n) => {
    if (n === sel.n) return;
    const target = new Map((n === cur ? d.brief.fields : d.versions.find((v) => v.n === n).fields).map((f) => [f.field, f.value + '|' + (f.weight || '')]));
    // Rows that do not exist in the target version collapse out; then the target renders and new or changed rows ease in.
    document.querySelectorAll('.rows .r[data-field]').forEach((el) => { if (!target.has(el.dataset.field)) el.classList.add('leaving'); });
    document.querySelectorAll('.rows').forEach((el) => el.classList.add('swapping'));
    state.verPrev = new Map(fields.map((f) => [f.field, f.value + '|' + (f.weight || '')]));
    await wait(200);
    state.ver[d.role.id] = n; await render();
    state.verPrev = null;
  };
  return h('div', { class: 'two' },
    h('div', { class: 'glass panel' },
      h('h3', null, isCur ? 'Role brief' : `Role brief as of ${fmtDate(sel.effective_date)}`, hint('The approved picture of what the client needs. It changes only when the lead recruiter approves a change in the Changes tab.')),
      isCur ? h('p', { class: 'sub' }, `Current. Last updated ${fmtDate(sel.effective_date)} after: ${SRC[sel.source_id] ? SRC[sel.source_id].title : sel.source_id}. Highlighted rows changed in that update.`)
        : h('div', { class: 'oldver' }, h('span', null, h('b', null, 'Older version. '), `This is how the brief looked after ${srcName(sel.source_id)}. It is no longer current.`), h('button', { class: 'pill dark', onclick: () => pick(cur) }, 'Back to current')),
      groups.map((g) => h('div', null, h('span', { class: 'grp' }, g),
        h('div', { class: 'rows' }, fields.filter((f) => f.group === g).map((f) => h('div', { 'data-field': f.field, class: `r${f.changed_in_version === sel.n ? ' chg' : ''}${state.verPrev ? (!state.verPrev.has(f.field) ? ' entering' : state.verPrev.get(f.field) !== f.value + '|' + (f.weight || '') ? ' changing' : ' settle') : ''}` },
          h('div', { class: 'k' }, f.label), h('div', { class: 'v' }, f.value, h('div', { class: 'chips' }, statusChips(f)),
            f.bias ? h('small', null, f.bias.note) : null, h('small', null, `${srcName(f.source_id)} · “${f.quote}”`)))))))),
    h('div', null, h('div', { class: 'glass panel' }, h('h3', null, 'History', hint('Each time an approved client change updated this brief. Click one to see the brief as it was then.')),
      h('ul', { class: 'list vers' }, d.versions.slice().reverse().map((v) => h('li', null, h('button', { class: `verb${v.n === sel.n ? ' on' : ''}`, 'aria-pressed': String(v.n === sel.n), onclick: () => pick(v.n) },
        h('span', null, h('b', null, fmtDate(v.effective_date)), h('small', null, SRC[v.source_id] ? SRC[v.source_id].title : v.source_id)), v.n === cur ? chip('Current', 'ok') : h('span', { class: 'go' }, 'View →')))))),
      verifyPanel(d)));
}
function verifyPanel(d) {
  return h('div', { class: 'glass panel' }, h('h3', null, 'What to verify in screenings', hint('The must-haves to check in every screening call, plus checks the team agreed after a client decision.')),
    h('p', { class: 'sub' }, 'Informational. It never blocks moving a candidate.'),
    h('span', { class: 'grp' }, 'Current must-haves'),
    h('ul', { class: 'list' }, d.verify.musts.length ? d.verify.musts.map((m) => h('li', null, h('span', { class: 'num' }, '✓'), h('div', null, m.label, h('small', null, m.value)))) : h('li', null, 'No must-haves yet.')),
    d.verify.suggestions.length ? h('span', { class: 'grp' }, 'From approved client-decision reviews') : null,
    h('ul', { class: 'list' }, d.verify.suggestions.map((s) => h('li', null, h('span', { class: 'num' }, '?'), h('div', null, s.text, h('small', null, `${s.why} (${srcName(s.source_id)})`))))));
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
    h('button', { class: 'pill dark', disabled: !ready, onclick: (e) => act(() => api(`/api/${kind}/${id}/approve`, {}), 'Approved', { leave: e.currentTarget.closest('.prop') }) }, 'Approve'),
    reason, h('button', { class: 'pill light', onclick: (e) => (reason.value.trim() ? act(() => api(`/api/${kind}/${id}/reject`, { reason: reason.value.trim() }), 'Rejected, kept for audit', { leave: e.currentTarget.closest('.prop'), dir: -1 }) : (toast('Write a reason first', true), shake(reason))) }, 'Reject'),
    ready ? null : chip('processing failed: see how this was processed', 'r'));
}
function proposalCard(p) {
  return h('article', { class: 'glass prop' },
    h('div', { class: 'head' }, h('h4', null, 'Proposed change to the brief'), stateChip(p.state), sevChip(p.severity), p.kind === 'manual-correction' ? chip(`manual correction of #${p.corrects}`, 'b') : null,
      null),
    h('p', { class: 'sub' }, `From ${p.title}, ${fmtDate(p.date)}${p.decided_by ? ` · decided by ${p.decided_by}` : ''}${p.reason ? ` · ${p.reason}` : ''}`),
    p.changes.map(changeBox), p.state === 'proposed' ? decisionActs('proposals', p.id, p.ready) : null);
}
const COV = { asked: ['Asked', 'ok'], briefly: ['Only briefly', 'ys'], not_asked: ['Not asked', 'r'], not_applicable_historical: ['Added later, not a gap', 'b'] };
function reviewCard(r, d) {
  const label = (c) => (d.matrix.rows.find((x) => x.field === c) || {}).label || c;
  return h('article', { class: 'glass prop' },
    h('div', { class: 'head' }, h('h4', null, `Client decision: ${r.candidate} ${r.decision.outcome}`), stateChip(r.state), r.status === 'insufficient_evidence' ? chip('Insufficient evidence', 'y') : chip('Compared with the brief at screening time', 'g', 'The screening is judged against what the brief said on the day of the call, not against later changes.')),
    h('p', { class: 'sub' }, `${fmtDate(r.date)} · client reason: ${r.decision.reason}. Retrospective: it coaches future screenings and does not re-score the candidate.${r.decided_by ? ` Decided by ${r.decided_by}.` : ''}`),
    r.status === 'insufficient_evidence' ? h('div', { class: 'cg' }, `No screening transcript for ${r.candidate} on this role was found dated on or before the decision. Nothing can be judged yet: add screening notes.`) : null,
    r.coverage.length ? h('ul', { class: 'list cov' }, r.coverage.map((c) => h('li', null, chip(COV[c.status][0], COV[c.status][1]), h('div', null, label(c.criterion), c.quote ? h('small', null, `“${c.quote}” (${srcName(r.screening_source_id)})`) : null)))) : null,
    r.overweighted.map((o) => h('div', { class: 'cg' }, h('b', null, 'Over-weighted: '), `${o.topic}, ${o.count} of ${o.total} questions`, h('div', { class: 'q' }, `“${o.quote}”`))),
    r.suggested.length ? h('div', null, h('span', { class: 'grp' }, 'Suggested for future screenings'), h('ul', { class: 'list' }, r.suggested.map((s) => h('li', null, h('span', { class: 'num' }, '→'), h('div', null, s.text, h('small', null, s.why)))))) : null,
    r.state === 'proposed' ? decisionActs('reviews', r.id, r.ready) : null);
}
const OUT = (o) => ({ version: chip('Updated the brief', 'k', 'The lead approved this change, so the role brief was updated.'), proposed: chip('proposal awaiting approval', 'y'), rejected: chip('proposal rejected', 'r'), no_version: chip('No change to the brief', 'g', 'Recorded for context; nothing in the brief needed to change.'), failed: chip(`processing failed at stage ${o.stage}`, 'r'), not_processed: chip('not processed yet', 'y'), superseded: chip('superseded', 'g') }[o.kind]);
const STAGE_INFO = {
  1: ['Received', 'The message or file was saved unchanged, so it can always be reread.'],
  2: ['Read by AI', 'The AI listed what changed in the role. Every quote it used was checked word for word against the original.'],
  3: ['Change proposed', 'Small details are only recorded; important changes become a proposal the lead must approve.'],
  4: ['Fairness check', 'Client requests about age, background or similar are flagged and never applied.'],
  5: ['Learning steps drafted', 'Each change becomes a short step for the team, released only after approval.'],
  6: ['Screening compared', 'For a client decision, the screening call is compared with what the brief asked for at the time.'],
  7: ['Sent to the team', 'Approved steps appear in each recruiter\'s Stay current tab.'],
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function stageText(r) {
  const c = r.check || {};
  if (r.status === 'skipped') return `Not needed: ${r.skip_reason}.`;
  if (r.status === 'pending') return c.note ? `Waiting: ${c.note}.` : 'Waiting.';
  if (r.status === 'failed') return `Stopped here: ${c.error || c.reason || 'a check did not pass'}. Nothing after this step was used.`;
  switch (r.stage) {
    case 1: return `Saved as a ${String(c.channel || 'source').replace(/-/g, ' ')} dated ${fmtDate(c.date)}.`;
    case 2: return c.no_change ? 'Nothing in it changes the role.' : `Found ${plural(c.changes || 0, 'change')}; ${c.quotes_verified || 0} of ${c.changes || 0} quotes match the original exactly.${c.truncated ? ' The text was long and was shortened.' : ''}`;
    case 3: return (c.results || []).map((x) => (x.decision === 'proposal' ? `Proposed a change to the brief (${x.severity === 'critical' ? 'critical' : 'important'}).` : `No change to the brief: ${x.reason}.`)).join(' ');
    case 4: return (c.restrictions || []).map((x) => (x.status === 'not_applied_bias' ? 'A client request was flagged as possible bias and will not be applied.' : 'A client restriction was checked and is lawful.')).join(' ') || 'Checked.';
    case 5: { const n = (c.proposals || []).reduce((a, x) => a + x.items, 0); return n ? `Drafted ${plural(n, 'learning step')} for the team.` : 'No learning step needed for this change.'; }
    case 6: return c.status === 'insufficient_evidence' ? 'No screening notes were found, so nothing could be compared.' : 'Compared the screening call with the brief at that time; suggestions are in the review below.';
    case 7: return `Sent ${plural(c.items || 0, 'step')} to ${(c.recruiters || []).length} recruiters.`;
    default: return 'Done.';
  }
}
function stagesTable(rows) {
  return h('div', null,
    h('ol', { class: 'stg' }, rows.map((r) => h('li', { class: r.status },
      h('span', { class: 'mark', 'aria-hidden': 'true' }, r.status === 'passed' ? '✓' : r.status === 'failed' ? '✗' : r.status === 'skipped' ? '–' : '…'),
      h('div', null, h('b', null, (STAGE_INFO[r.stage] || [r.name])[0], hint((STAGE_INFO[r.stage] || [, r.name])[1])), h('span', { class: 'sr' }, ` (${r.status})`), h('div', null, stageText(r)))))),
    h('details', { class: 'raw' }, h('summary', null, 'Technical record (for audits)'), h('code', null, JSON.stringify(rows.map((r) => ({ stage: r.stage, status: r.status, check: r.check })), null, 1))));
}
function howProcessed(s) {
  const box = h('div', null);
  const det = h('details', { class: 'how', open: !!state.open[s.source_id] }, h('summary', null, 'How this was processed'), box);
  det.addEventListener('toggle', async () => {
    state.open[s.source_id] = det.open;
    if (det.open && !box.childNodes.length) {
      try { box.replaceChildren(stagesTable(await api(`/api/stages?source=${encodeURIComponent(s.source_id)}`)), h('p', { class: 'stubnote' }, 'Each step has a check. A step counts only when its check passed, so nothing reaches the team on the AI\'s word alone.')); }
      catch (e) { box.replaceChildren(`Could not load: ${e.message}`); }
    }
  });
  if (det.open) det.dispatchEvent(new Event('toggle'));
  return det;
}
function matrixTable(m) {
  const groups = [...new Set(m.rows.map((r) => r.group))];
  return h('div', { class: 'cmpwrap' }, h('table', { class: 'cmp' },
    h('thead', null, h('tr', null, h('th', null, ''), m.versions.map((v) => h('th', null, h('b', null, `Version ${v.n}`), fmtDate(v.date))))),
    h('tbody', null, groups.flatMap((g) => [h('tr', { class: 'grprow' }, h('th', { colspan: m.versions.length + 1, scope: 'colgroup' }, g)),
      ...m.rows.filter((r) => r.group === g).map((r) => h('tr', null, h('td', null, r.label),
        r.cells.map((c, i) => (c.empty ? h('td', { class: 'empty' }, '—') : (!c.changed && i > 0 ? h('td', { class: 'same' }, '=') : h('td', { class: `cell${c.changed ? ' c' : ''}` }, c.value, h('small', null, [{ must: 'must-have', nice: 'nice to have' }[c.weight] || c.weight, c.status === 'not_applied_bias' ? '⚑ not applied' : c.status].filter(Boolean).join(' · '))))))))]))));
}
function changesTab(d) {
  const open = d.proposals.filter((p) => p.state === 'proposed');
  const openRev = d.reviews.filter((r) => r.state === 'proposed');
  const hist = d.proposals.filter((p) => p.state !== 'proposed');
  const histRev = d.reviews.filter((r) => r.state !== 'proposed');
  return h('div', null,
    h('div', { class: 'sechead' }, h('h3', null, 'Awaiting approval', hint('When the client says something new about the role, the system proposes a change to the brief. The lead recruiter approves or rejects it here; the team sees it only after approval.')), chip(open.length + openRev.length, open.length + openRev.length ? 'y' : 'g')),
    open.length + openRev.length ? [open.map(proposalCard), openRev.map((r) => reviewCard(r, d))] : h('p', { class: 'sub' }, 'Nothing to approve: every proposed change to the brief has been decided.'),
    h('div', { class: 'glass panel' }, h('h3', null, 'What the client told us', hint('Every call, email, news item and client decision about this role, oldest first. Open "How this was processed" to see each step the system took.')), h('p', { class: 'sub' }, 'Every message, call and decision received for this position, and what it changed.'),
      h('ul', { class: 'tlist' }, d.timeline.map((s) => h('li', null, h('div', { class: 'd' }, fmtDate(s.date), h('br'), s.channel), h('div', null,
        h('div', { class: 't' }, s.title, ' ', OUT(s.outcome), s.decision ? chip(`Client ${s.decision.outcome} ${s.decision.candidate}`, 'b') : null, s.review_state ? chip(`review ${s.review_state}`, s.review_state === 'approved' ? 'ok' : s.review_state === 'rejected' ? 'r' : 'y') : null),
        h('div', { class: 's' }, s.summary || 'No analysis yet.'), howProcessed(s)))))),
    h('div', { class: 'glass panel' }, h('h3', null, 'Compare versions', hint('Each column is the brief after one approved update. Read across a row to see how one requirement changed over time.')), h('p', { class: 'sub' }, 'Yellow cells changed in that version; = means unchanged; — means not in the brief yet.'), d.matrix.versions.length ? matrixTable(d.matrix) : 'No versions yet.'),
    hist.length + histRev.length ? h('div', null, h('div', { class: 'sechead' }, h('h3', null, 'Past decisions', hint('Changes the lead already approved or rejected, and the lessons drawn from each client decision about a candidate. Kept as a record.'))), hist.map(proposalCard), histRev.map((r) => reviewCard(r, d))) : null);
}

// ---- stay current ----
function ackItem(it, d) {
  return itemShell(it, [h('div', { class: 'was' }, it.detail.was ? h('small', null, `was: ${it.detail.was}`) : null), it.detail.note ? h('p', { class: 'sub' }, it.detail.note) : null,
    it.completion ? null : h('button', { class: 'pill dark', onclick: () => act(() => api(`/api/items/${it.id}/complete`, { recruiter: d.me }), 'Confirmed', { mark: ['item', it.id] }) }, 'I have read and understood this')]);
}
function studyItem(it, d) {
  const ta = h('textarea', { rows: 4, 'aria-label': `Your answer: ${it.title}`, placeholder: 'Answer in your own words (at least 20 characters)', value: it.completion ? it.completion.response || '' : '', disabled: !!it.completion });
  const result = h('div', { class: 'fb', hidden: true });
  const res = it.completion ? it.completion.result : null;
  const showRes = (r) => { result.hidden = false; result.replaceChildren(h('b', { class: r.passed ? 'ok' : 'bad' }, r.passed ? 'Answer recorded. ' : `Not recorded yet: ${r.rule}. `), r.points ? r.points.map((p) => h('div', { class: `pt${p.hit ? ' y' : ''}` }, p.hit ? '✓' : '○', ' ', p.text)) : null, r.note ? h('p', { class: 'stubnote' }, `Replay stub: ${r.note}`) : null); };
  if (res) showRes(res);
  return itemShell(it, [h('p', { class: 'prompt' }, it.detail.prompt), h('div', { class: 'answer' }, ta), result,
    it.completion ? null : h('div', { class: 'acts split' }, h('button', { class: 'micb', type: 'button', title: 'Answer by voice: not available yet', onclick: () => $('pop').classList.add('on') }, micIcon(), h('span', null, 'Record audio'), h('em', null, 'soon')), h('button', { class: 'pill dark', onclick: async () => {
      try { const r = await api(`/api/items/${it.id}/complete`, { recruiter: d.me, response: ta.value }); if (r.passed) { state.mark = ['item', it.id]; toast('Answer recorded'); await render(); } else { showRes(r.result); shake(ta); } }
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
        if (r.passed) { state.mark = ['item', it.id]; toast('Review recorded'); await render(); } else toast(`Not recorded: ${r.result.rule}`, true);
      } catch (e) { toast(e.message, true); }
    } }, 'Accept review'))]);
}
function itemShell(it, kids) {
  return h('article', { class: `glass item${it.completion ? ' done' : ' todo'}`, 'data-item': it.id }, h('div', { class: 'top' }, h('b', null, it.title), it.completion ? chip('✓ Done', 'ok') : chip('To do', 'y')),
    h('small', null, `From ${srcName(it.source_id)}`), kids);
}
// ---- ask about this role (chat grounded in the current brief) ----
state.chat = {};
function askPanel(d) {
  const log = (state.chat[d.role.id] ||= []);
  const list = h('div', { class: 'chatlog', 'aria-live': 'polite' });
  const draw = () => { examples.classList.toggle('gone', log.length > 0); list.hidden = !log.length; list.replaceChildren(...(log.length ? log.map((m) => h('div', { class: `msg ${m.role}${m.error ? ' err' : ''}` },
    h('div', null, m.content),
    m.role === 'assistant' && !m.error ? h('small', null, m.stub ? 'Stub: no live model connected.' : m.in_brief ? `Based on the brief${m.based_on.length ? `: ${m.based_on.map((b) => b.label).join(', ')}` : ''}.` : 'Not in the brief: confirm with the client.') : null))
    : [])); };
  const examples = h('p', { class: 'sub examples' }, 'Examples: “What is LangGraph and why would they care?” · “What does owning an incident look like?”');
  const q = h('input', { type: 'text', placeholder: 'Ask anything about this role', 'aria-label': 'Your question about this role', maxlength: '500' });
  const btn = h('button', { class: 'pill dark', type: 'submit' }, 'Ask');
  const form = h('form', { class: 'askform', onsubmit: async (e) => {
    e.preventDefault();
    const question = q.value.trim(); if (!question) return;
    const history = log.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    log.push({ role: 'user', content: question }); q.value = ''; btn.disabled = true; btn.textContent = 'Thinking…'; draw();
    const dots = h('div', { class: 'msg assistant typing', 'aria-label': 'Thinking' }, h('i'), h('i'), h('i')); list.append(dots); list.scrollTop = list.scrollHeight;
    const t0 = Date.now();
    try { const r = await api(`/api/roles/${d.role.id}/ask`, { question, history }); log.push({ role: 'assistant', content: r.answer, in_brief: r.in_brief, based_on: r.based_on, stub: r.stub }); }
    catch (err) { log.push({ role: 'assistant', content: err.message, error: true }); }
    await wait(Math.max(0, 450 - (Date.now() - t0)));
    btn.disabled = false; btn.textContent = 'Ask'; draw(); list.scrollTop = list.scrollHeight; q.focus();
  } }, q, btn);
  draw();
  return h('div', { class: 'glass panel' }, h('h3', null, 'Ask about this role', hint('Short answers based only on the approved brief for this role. If the brief does not cover it, the answer says so and you should ask the client.')),
    h('p', { class: 'sub' }, 'Unsure about a term or requirement? Ask. Answers are short and based on this role’s brief.'), list, form, examples);
}
// Scroll to the first open step and pulse it once.
function goToNext() {
  const el = document.querySelector('.item.todo'); if (!el) return;
  el.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  setTimeout(() => el.querySelector('textarea:not([disabled]), button.pill, input')?.focus({ preventScroll: true }), 450);
}
function currentTab(d) {
  const by = (k) => d.items.filter((i) => i.kind === k);
  const TIPS = { ack: 'Facts to know, like budget or location. Tick once you have read them.', study: 'A new must-have or level change. Explain in your own words how you would check it in a screening.', review: 'The client decided on a candidate. See what the screening covered and agree what to check next time.' };
  const sec = (title, sub, k, fn) => (by(k).length ? h('div', null, h('div', { class: 'sechead' }, h('h3', null, title, hint(TIPS[k])), h('span', { class: 'sub' }, `${by(k).filter((i) => i.completion).length} of ${by(k).length} done · ${sub}`)), by(k).map((i) => fn(i, d))) : null);
  return h('div', { class: 'two' },
    h('div', null,
      h('div', { class: `glass panel${d.my_progress.done < d.my_progress.total ? ' due' : ''}` }, h('h3', null, 'Stay current'),
        d.my_progress.done < d.my_progress.total
          ? h('div', { class: 'duebar' }, h('span', null, h('b', null, `${d.my_progress.total - d.my_progress.done} step${d.my_progress.total - d.my_progress.done > 1 ? 's' : ''} waiting for you. `), 'Each takes a minute and keeps your screenings in line with what the client wants now.'), h('button', { class: 'pill dark', onclick: goToNext }, 'Start now'))
          : h('p', { class: 'sub' }, `All done: you have completed ${d.my_progress.total} of ${d.my_progress.total} steps for this position.`)),
      askPanel(d),
      d.items.length ? null : h('p', { class: 'sub' }, 'Nothing to learn yet: no approved change has created a step.'),
      sec('Confirm', 'read and acknowledge', 'ack', ackItem), sec('Study', 'write what you would do', 'study', studyItem), sec('Review', 'learn from the client decision', 'review', reviewItem)),
    h('div', null, h('div', { class: 'glass panel' }, h('h3', null, 'Team', hint('Up to date means the recruiter completed every step for this position: a confirmation, a written answer or an accepted review.')), h('p', { class: 'sub' }, 'Who has learned every approved change.'),
      d.team.map((t) => h('div', { class: `trow${t.id === d.me ? ' me' : ''}` }, h('b', null, t.name), h('span', { 'data-num': `team-${t.id}` }, `${t.done}/${t.total}`),
        t.up_to_date ? chip('Up to date', 'ok') : t.id === d.me ? h('button', { class: 'pill dark sm', onclick: goToNext }, `Do it now (${t.pending})`) : chip(`${t.pending} to do`, 'y')))),
      verifyPanel(d)));
}

render();
