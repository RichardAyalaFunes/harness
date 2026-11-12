'use client';
import { Fragment, useState } from 'react';
import { Chip, Details, Hint, shake } from '../ui.tsx';
import { useApp } from '../Shell.tsx';
import { api, fmtDate, plural } from '../../lib/client/format.ts';
import { RejectBody, fieldMessage } from '../../lib/contracts/api.ts';
import { useSrc } from '../src-context.ts';
import { WeightChip } from './shared.tsx';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SevChip = ({ s }: { s: string }) => <Chip text={cap(s)} cls={s === 'critical' ? 'r' : s === 'material' ? 'y' : 'g'} />;
// Source channels are stored as slugs ("meeting-transcript"); show them as words.
const CHANNEL: Record<string, string> = { jd: 'Job description', 'meeting-transcript': 'Call notes', email: 'Email', news: 'News', 'client-decision': 'Client decision', 'screening-transcript': 'Screening notes', 'manual-correction': 'Manual correction' };
const channelLabel = (c: string) => CHANNEL[c] ?? cap(String(c).replace(/-/g, ' '));
function StateChip({ s }: { s: string }) {
  switch (s) {
    case 'proposed': return <Chip text="Awaiting approval" cls="y" />;
    case 'approved': return <Chip text="Approved" cls="ok" />;
    case 'rejected': return <Chip text="Rejected" cls="r" />;
    case 'superseded': return <Chip text="Superseded by a changed file" cls="g" />;
    case 'superseded_noop': return <Chip text="Superseded: nothing material left after rebase" cls="g" />;
    default: return <Chip text={s} />;
  }
}

function ChangeBox({ c }: { c: any }) {
  const shown = c.op === 'remove' ? 'removed' : c.value;
  return (
    <div className={`cg${c.bias ? ' bias' : ''}`}>
      <b>{c.label}</b> <span>{c.old ? `${c.old} → ${shown}` : `→ ${shown}`}</span> <SevChip s={c.severity} /> <WeightChip w={c.weight} />
      {c.status === 'applied' ? <Chip text="applied, shown in brief only" cls="g" /> : null}
      {c.status === 'not_applied_bias' ? <Chip text={`Not applied · possible bias (${c.bias ? c.bias.kind : '?'})`} cls="r" /> : null}
      {c.confirmed === false ? <Chip text="not confirmed" cls="ys" /> : null}
      {c.conflicts_with ? <Chip text={`conflicts with ${c.conflicts_with}`} cls="r" /> : null}
      {c.bias ? <div className="q">{c.bias.note}</div> : null}
      <div className="q">{`“${c.quote}”`}</div>
    </div>
  );
}

/** Approve / reject. The reject reason is validated with the same schema the server uses. */
function DecisionActs({ kind, id, ready }: { kind: 'proposals' | 'reviews'; id: number; ready: boolean }) {
  const { act, toast } = useApp();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const field = (el: Element) => el.closest('.acts')?.querySelector('input');
  return (
    <div className="acts">
      <button className="pill dark" disabled={!ready} onClick={(e) => act(() => api(`/api/${kind}/${id}/approve`, {}), 'Approved', { leave: e.currentTarget.closest('.prop') })}>Approve</button>
      <input type="text" placeholder="Reason for rejecting" aria-label="Reason for rejecting" value={reason} aria-invalid={!!err} onChange={(e) => { setReason(e.target.value); setErr(null); }} />
      <button className="pill light" onClick={(e) => {
        const msg = fieldMessage(RejectBody.shape.reason, reason);
        if (msg) { setErr(msg); toast(msg === 'write at least 10 characters' ? 'Write a reason first (at least 10 characters)' : msg, true); shake(field(e.currentTarget)); return; }
        return act(() => api(`/api/${kind}/${id}/reject`, { reason: reason.trim() }), 'Rejected, kept for audit', { leave: e.currentTarget.closest('.prop'), dir: -1 });
      }}>Reject</button>
      {ready ? null : <Chip text="processing failed: see how this was processed" cls="r" />}
      {err ? <span className="fielderr" role="alert">{err}</span> : null}
    </div>
  );
}

function ProposalCard({ p }: { p: any }) {
  return (
    <article className="glass prop">
      <div className="head"><h4>Proposed change to the brief</h4><StateChip s={p.state} /><SevChip s={p.severity} />{p.kind === 'manual-correction' ? <Chip text={`manual correction of #${p.corrects}`} cls="b" /> : null}</div>
      <p className="sub">{`From ${p.title}, ${fmtDate(p.date)}${p.decided_by ? ` · decided by ${p.decided_by}` : ''}${p.reason ? ` · ${p.reason}` : ''}`}</p>
      {p.changes.map((c: any) => <ChangeBox key={c.id} c={c} />)}
      {p.state === 'proposed' ? <DecisionActs kind="proposals" id={p.id} ready={p.ready} /> : null}
    </article>
  );
}

const COV: Record<string, [string, string]> = { asked: ['Asked', 'ok'], briefly: ['Only briefly', 'ys'], not_asked: ['Not asked', 'r'], not_applicable_historical: ['Added later, not a gap', 'b'] };
function ReviewCard({ r, d }: { r: any; d: any }) {
  const src = useSrc();
  const label = (c: string) => (d.matrix.rows.find((x: any) => x.field === c) || {}).label || c;
  return (
    <article className="glass prop">
      <div className="head">
        <h4>{`Client decision: ${r.candidate} ${r.decision.outcome}`}</h4><StateChip s={r.state} />
        {r.status === 'insufficient_evidence' ? <Chip text="Insufficient evidence" cls="y" /> : <Chip text="Compared with the brief at screening time" cls="g" tip="The screening is judged against what the brief said on the day of the call, not against later changes." />}
      </div>
      <p className="sub">{`${fmtDate(r.date)} · client reason: ${r.decision.reason}. Retrospective: it coaches future screenings and does not re-score the candidate.${r.decided_by ? ` Decided by ${r.decided_by}.` : ''}`}</p>
      {r.status === 'insufficient_evidence' ? <div className="cg">{`No screening transcript for ${r.candidate} on this role was found dated on or before the decision. Nothing can be judged yet: add screening notes.`}</div> : null}
      {r.coverage.length ? (
        <ul className="list cov">
          {r.coverage.map((c: any) => <li key={c.criterion}><Chip text={COV[c.status]![0]} cls={COV[c.status]![1]} /><div>{label(c.criterion)}{c.quote ? <small>{`“${c.quote}” (${src.name(r.screening_source_id)})`}</small> : null}</div></li>)}
        </ul>
      ) : null}
      {r.overweighted.map((o: any, i: number) => <div key={i} className="cg"><b>Over-weighted: </b>{`${o.topic}, ${o.count} of ${o.total} questions`}<div className="q">{`“${o.quote}”`}</div></div>)}
      {r.suggested.length ? (
        <div><span className="grp">Suggested for future screenings</span>
          <ul className="list">{r.suggested.map((s: any, i: number) => <li key={i}><span className="num">→</span><div>{s.text}<small>{s.why}</small></div></li>)}</ul>
        </div>
      ) : null}
      {r.state === 'proposed' ? <DecisionActs kind="reviews" id={r.id} ready={r.ready} /> : null}
    </article>
  );
}

function Outcome({ o }: { o: any }) {
  switch (o.kind) {
    case 'version': return <Chip text="Updated the brief" cls="k" tip="The lead approved this change, so the role brief was updated." />;
    case 'proposed': return <Chip text="proposal awaiting approval" cls="y" />;
    case 'rejected': return <Chip text="proposal rejected" cls="r" />;
    case 'no_version': return <Chip text="No change to the brief" cls="g" tip="Recorded for context; nothing in the brief needed to change." />;
    case 'failed': return <Chip text={`processing failed at stage ${o.stage}`} cls="r" />;
    case 'not_processed': return <Chip text="not processed yet" cls="y" />;
    case 'superseded': return <Chip text="superseded" cls="g" />;
    default: return null;
  }
}

const STAGE_INFO: Record<number, [string, string]> = {
  1: ['Received', 'The message or file was saved unchanged, so it can always be reread.'],
  2: ['Read by AI', 'The AI listed what changed in the role. Every quote it used was checked word for word against the original.'],
  3: ['Change proposed', 'Small details are only recorded; important changes become a proposal the lead must approve.'],
  4: ['Fairness check', 'Client requests about age, background or similar are flagged and never applied.'],
  5: ['Learning steps drafted', 'Each change becomes a short step for the team, released only after approval.'],
  6: ['Screening compared', 'For a client decision, the screening call is compared with what the brief asked for at the time.'],
  7: ['Sent to the team', "Approved steps appear in each recruiter's Stay current tab."],
};
function stageText(r: any): string {
  const c = r.check || {};
  if (r.status === 'skipped') return `Not needed: ${r.skip_reason}.`;
  if (r.status === 'pending') return c.note ? `Waiting: ${c.note}.` : 'Waiting.';
  if (r.status === 'failed') return `Stopped here: ${c.error || (c.errors && c.errors[0]) || c.reason || 'a check did not pass'}. Nothing after this step was used.`;
  switch (r.stage) {
    case 1: return `Saved as a ${String(c.channel || 'source').replace(/-/g, ' ')} dated ${fmtDate(c.date)}.`;
    case 2: return c.no_change ? 'Nothing in it changes the role.' : `Found ${plural(c.changes || 0, 'change')}; ${c.quotes_verified || 0} of ${c.changes || 0} quotes match the original exactly.${c.truncated ? ' The text was long and was shortened.' : ''}${c.repair ? ' The first answer failed a check and was corrected once.' : ''}`;
    case 3: return (c.results || []).map((x: any) => (x.decision === 'proposal' ? `Proposed a change to the brief (${x.severity === 'critical' ? 'critical' : 'important'}).` : `No change to the brief: ${x.reason}.`)).join(' ');
    case 4: return (c.restrictions || []).map((x: any) => (x.status === 'not_applied_bias' ? 'A client request was flagged as possible bias and will not be applied.' : 'A client restriction was checked and is lawful.')).join(' ') || 'Checked.';
    case 5: { const n = (c.proposals || []).reduce((a: number, x: any) => a + x.items, 0); return n ? `Drafted ${plural(n, 'learning step')} for the team.` : 'No learning step needed for this change.'; }
    case 6: return c.status === 'insufficient_evidence' ? 'No screening notes were found, so nothing could be compared.' : 'Compared the screening call with the brief at that time; suggestions are in the review below.';
    case 7: return `Sent ${plural(c.items || 0, 'step')} to ${(c.recruiters || []).length} recruiters.`;
    default: return 'Done.';
  }
}

function StagesTable({ rows }: { rows: any[] }) {
  return (
    <div>
      <ol className="stg">
        {rows.map((r) => (
          <li key={r.stage} className={r.status}>
            <span className="mark" aria-hidden="true">{r.status === 'passed' ? '✓' : r.status === 'failed' ? '✗' : r.status === 'skipped' ? '–' : '…'}</span>
            <div><b>{(STAGE_INFO[r.stage] || [r.name])[0]}<Hint text={(STAGE_INFO[r.stage] || ['', r.name])[1]!} /></b><span className="sr">{` (${r.status})`}</span><div>{stageText(r)}</div></div>
          </li>
        ))}
      </ol>
      <Details className="raw" summary="Technical record (for audits)">
        <code>{JSON.stringify(rows.map((r) => ({ stage: r.stage, status: r.status, check: r.check, trace_id: r.trace_id })), null, 1)}</code>
      </Details>
    </div>
  );
}

function HowProcessed({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (o: boolean) => {
    setOpen(o);
    if (o && !rows) api(`/api/stages?source=${encodeURIComponent(s.source_id)}`).then(setRows).catch((e) => setErr(e.message));
  };
  return (
    <Details className="how" summary="How this was processed" open={open} onToggle={toggle}>
      <div>
        {err ? `Could not load: ${err}` : rows ? (<><StagesTable rows={rows} /><p className="stubnote">Each step has a check. A step counts only when its check passed, so nothing reaches the team on the AI's word alone.</p></>) : 'Loading…'}
      </div>
    </Details>
  );
}

function MatrixTable({ m }: { m: any }) {
  const groups = [...new Set(m.rows.map((r: any) => r.group))] as string[];
  return (
    <div className="cmpwrap">
      <table className="cmp">
        <thead><tr><th />{m.versions.map((v: any) => <th key={v.n}><b>{`Version ${v.n}`}</b>{fmtDate(v.date)}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr className="grprow"><th colSpan={m.versions.length + 1} scope="colgroup">{g}</th></tr>
              {m.rows.filter((r: any) => r.group === g).map((r: any) => (
                <tr key={r.field}>
                  <td>{r.label}</td>
                  {r.cells.map((c: any, i: number) => (c.empty ? <td key={i} className="empty">—</td>
                    : !c.changed && i > 0 ? <td key={i} className="same">=</td>
                    : <td key={i} className={`cell${c.changed ? ' c' : ''}`}>{c.value}<small>{[({ must: 'must-have', nice: 'nice to have' } as any)[c.weight] || c.weight, c.status === 'not_applied_bias' ? '⚑ not applied' : c.status].filter(Boolean).join(' · ')}</small></td>))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChangesTab({ d }: { d: any }) {
  const open = d.proposals.filter((p: any) => p.state === 'proposed');
  const openRev = d.reviews.filter((r: any) => r.state === 'proposed');
  const hist = d.proposals.filter((p: any) => p.state !== 'proposed');
  const histRev = d.reviews.filter((r: any) => r.state !== 'proposed');
  const n = open.length + openRev.length;
  return (
    <div>
      <div className="sechead"><h3>Awaiting approval<Hint text="When the client says something new about the role, the system proposes a change to the brief. The lead recruiter approves or rejects it here; the team sees it only after approval." /></h3><Chip text={n} cls={n ? 'y' : 'g'} /></div>
      {n ? (<>{open.map((p: any) => <ProposalCard key={p.id} p={p} />)}{openRev.map((r: any) => <ReviewCard key={r.id} r={r} d={d} />)}</>) : <p className="sub">Nothing to approve: every proposed change to the brief has been decided.</p>}
      <div className="glass panel">
        <h3>What the client told us<Hint text={'Every call, email, news item and client decision about this role, oldest first. Open "How this was processed" to see each step the system took.'} /></h3>
        <p className="sub">Every message, call and decision received for this position, and what it changed.</p>
        <ul className="tlist">
          {d.timeline.map((s: any) => (
            <li key={s.source_id}>
              <div className="d"><b>{fmtDate(s.date)}</b>{channelLabel(s.channel)}</div>
              <div>
                <div className="t">{s.title} <Outcome o={s.outcome} />
                  {s.decision ? <Chip text={`Client ${s.decision.outcome} ${s.decision.candidate}`} cls="b" /> : null}
                  {s.review_state ? <Chip text={`Review ${s.review_state}`} cls={s.review_state === 'approved' ? 'ok' : s.review_state === 'rejected' ? 'r' : 'y'} /> : null}
                </div>
                <div className="s">{s.summary || 'No analysis yet.'}</div>
                <HowProcessed s={s} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass panel">
        <h3>Compare versions<Hint text="Each column is the brief after one approved update. Read across a row to see how one requirement changed over time." /></h3>
        <p className="sub">Yellow cells changed in that version; = means unchanged; — means not in the brief yet.</p>
        {d.matrix.versions.length ? <MatrixTable m={d.matrix} /> : 'No versions yet.'}
      </div>
      {hist.length + histRev.length ? (
        <div>
          <div className="sechead"><h3>Past decisions<Hint text="Changes the lead already approved or rejected, and the lessons drawn from each client decision about a candidate. Kept as a record." /></h3></div>
          {hist.map((p: any) => <ProposalCard key={p.id} p={p} />)}{histRev.map((r: any) => <ReviewCard key={r.id} r={r} d={d} />)}
        </div>
      ) : null}
    </div>
  );
}
