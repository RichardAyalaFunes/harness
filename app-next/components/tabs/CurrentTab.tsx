'use client';
// Stay current: the recruiter's steps (confirm, study, review), "Ask about this role", the team and what to verify.
import { useRef, useState, type ReactNode } from 'react';
import { Chip, Hint, MicIcon, shake } from '../ui.tsx';
import { useApp } from '../Shell.tsx';
import { useSrc } from '../src-context.ts';
import { api, prefersReducedMotion, wait } from '../../lib/client/format.ts';
import { AskBody, fieldMessage } from '../../lib/contracts/api.ts';
import { VerifyPanel } from './shared.tsx';

function ItemShell({ it, children }: { it: any; children: ReactNode }) {
  const src = useSrc();
  return (
    <article className={`glass item${it.completion ? ' done' : ' todo'}`} data-item={it.id}>
      <div className="top"><b>{it.title}</b>{it.completion ? <Chip text="✓ Done" cls="ok" /> : <Chip text="To do" cls="y" />}</div>
      <small>{`From ${src.name(it.source_id)}`}</small>
      {children}
    </article>
  );
}

function AckItem({ it, d }: { it: any; d: any }) {
  const { act } = useApp();
  // The old value is shown only when the title does not already say it (e.g. "Budget is now X" shows what it was before).
  const was = it.detail.was && !String(it.title).includes(it.detail.was) ? it.detail.was : null;
  return (
    <ItemShell it={it}>
      {was ? <p className="before"><span>Before</span><s>{was}</s></p> : null}
      {it.detail.note ? <p className="sub">{it.detail.note}</p> : null}
      {it.completion ? null : <div className="acts"><button className="pill dark" onClick={() => act(() => api(`/api/items/${it.id}/complete`, { recruiter: d.me }), 'Confirmed', { mark: ['item', it.id] })}>I have read and understood this</button></div>}
    </ItemShell>
  );
}

function StudyResult({ r }: { r: any }) {
  const ai = r.ai && !r.ai.stub && !r.ai.error ? r.ai : null;
  const hit = (p: any, i: number) => (ai ? ai.covered[i] : p.hit);
  return (
    <div className="fb">
      <b className={r.passed ? 'ok' : 'bad'}>{r.passed ? 'Answer recorded. ' : `Not recorded yet: ${r.rule}. `}</b>
      {ai ? <p className="aicomment">{ai.comment}</p> : null}
      {r.points ? (<div><small className="ptlabel">What a full answer covers</small>{r.points.map((p: any, i: number) => <div key={i} className={`pt${hit(p, i) ? ' y' : ''}`}>{hit(p, i) ? '✓' : '○'} {p.text}</div>)}</div>) : null}
      {ai && ai.try_asking ? <p className="tryask"><b>Try asking a candidate: </b>{`“${ai.try_asking}”`}</p> : null}
      {ai ? <p className="stubnote">Coaching from the AI, based on this role’s brief. It is advice, not a grade.</p>
        : r.ai && r.ai.error ? <p className="stubnote">{`AI feedback unavailable (${r.ai.error}). Showing keyword matches instead.`}</p>
        : r.note ? <p className="stubnote">{`No live model: ${r.note}`}</p> : null}
    </div>
  );
}

function StudyItem({ it, d }: { it: any; d: any }) {
  const { toast, showPop } = useApp();
  const router = useAppRefresh();
  const [text, setText] = useState<string>(it.completion ? it.completion.response || '' : '');
  const [res, setRes] = useState<any>(it.completion ? it.completion.result : null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/items/${it.id}/complete`, { recruiter: d.me, response: text });
      if (r.passed) { router.markAndRefresh(['item', it.id]); toast('Answer recorded'); }
      else { setRes(r.result); shake(box.current); }
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <ItemShell it={it}>
      <p className="prompt">{it.detail.prompt}</p>
      <div className="answer"><textarea ref={box} rows={4} aria-label={`Your answer: ${it.title}`} placeholder="Answer in your own words (at least 20 characters)" value={text} disabled={!!it.completion || busy} onChange={(e) => setText(e.target.value)} maxLength={4000} /></div>
      {res ? <StudyResult r={res} /> : null}
      {it.completion ? null : (
        <div className="acts split">
          <button className="micb" type="button" title="Answer by voice: not available yet" onClick={showPop}><MicIcon /><span>Record audio</span><em>soon</em></button>
          <button className="pill dark" disabled={busy} onClick={submit}>{busy ? 'Checking…' : 'Submit answer'}</button>
        </div>
      )}
    </ItemShell>
  );
}

function ReviewItem({ it, d }: { it: any; d: any }) {
  const { toast } = useApp();
  const router = useAppRefresh();
  const done = !!it.completion;
  const [picked, setPicked] = useState<number[]>(done ? it.completion.accepted || [] : []);
  const [none, setNone] = useState(false);
  const [why, setWhy] = useState('');
  const submit = async () => {
    try {
      const r = await api(`/api/items/${it.id}/complete`, { recruiter: d.me, accepted: picked, none_needed: none, response: why });
      if (r.passed) { router.markAndRefresh(['item', it.id]); toast('Review recorded'); } else toast(`Not recorded: ${r.result.rule}`, true);
    } catch (e: any) { toast(e.message, true); }
  };
  return (
    <ItemShell it={it}>
      <p className="sub">{`Client said: ${it.detail.reason}`}</p>
      {it.detail.note ? <div className="cg">{it.detail.note}</div> : null}
      {(it.detail.suggested || []).map((s: any, i: number) => (
        <label key={i} className="chk"><input type="checkbox" checked={picked.includes(i)} disabled={done} onChange={(e) => setPicked(e.target.checked ? [...picked, i] : picked.filter((x) => x !== i))} /><span>{s.text}<br /><small>{s.why}</small></span></label>
      ))}
      <label className="chk"><input type="checkbox" checked={none} disabled={done} onChange={(e) => setNone(e.target.checked)} /><span>None of these is needed</span></label>
      {none || why ? <input className="field" type="text" placeholder="Why none is needed" aria-label="Why none is needed" value={why} disabled={done} onChange={(e) => setWhy(e.target.value)} /> : null}
      {done ? null : <div className="acts"><button className="pill dark" onClick={submit}>Accept review</button></div>}
    </ItemShell>
  );
}

/** Refresh the page data after an action the component handled itself, remembering which item to highlight. */
function useAppRefresh() {
  const app = useApp();
  return { markAndRefresh: (m: [string, number | string]) => { app.act(async () => null, undefined, { mark: m }); } };
}

// ---- Ask about this role ---------------------------------------------------------------------------------------
interface Msg { role: 'user' | 'assistant'; content: string; error?: boolean; stub?: boolean; in_brief?: boolean; based_on?: { label: string }[] }
const chats = new Map<string, Msg[]>(); // survives tab switches and page refreshes, like the old per-role log

function AskPanel({ d }: { d: any }) {
  const roleId = d.role.id as string;
  const [log, setLog] = useState<Msg[]>(chats.get(roleId) || []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const push = (next: Msg[]) => { chats.set(roleId, next); setLog(next); setTimeout(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, 0); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    const msg = fieldMessage(AskBody.shape.question, question);
    if (msg) { setFormErr(msg); shake(input.current); return; }
    setFormErr(null);
    const history = log.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    const withQ = [...log, { role: 'user', content: question } as Msg];
    push(withQ); setQ(''); setBusy(true);
    const t0 = Date.now();
    let next: Msg[];
    try {
      const r = await api(`/api/roles/${roleId}/ask`, { question, history });
      next = [...withQ, { role: 'assistant', content: r.answer, in_brief: r.in_brief, based_on: r.based_on, stub: r.stub }];
    } catch (err: any) { next = [...withQ, { role: 'assistant', content: err.traceId ? `${err.message} (trace ${err.traceId})` : err.message, error: true }]; }
    await wait(Math.max(0, 450 - (Date.now() - t0)), prefersReducedMotion());
    push(next); setBusy(false); setTimeout(() => input.current?.focus(), 0);
  };
  return (
    <div className="glass panel">
      <h3>Ask about this role<Hint text="Short answers based only on the approved brief for this role. If the brief does not cover it, the answer says so and you should ask the client." /></h3>
      <p className="sub">Unsure about a term or requirement? Ask. Answers are short and based on this role’s brief.</p>
      <div className="chatlog" aria-live="polite" ref={list} hidden={!log.length && !busy}>
        {log.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? ' err' : ''}`}>
            <div>{m.content}</div>
            {m.role === 'assistant' && !m.error ? <small>{m.stub ? 'Stub: no live model connected.' : m.in_brief ? `Based on the brief${m.based_on?.length ? `: ${m.based_on.map((b) => b.label).join(', ')}` : ''}.` : 'Not in the brief: confirm with the client.'}</small> : null}
          </div>
        ))}
        {busy ? <div className="msg assistant typing" aria-label="Thinking"><i /><i /><i /></div> : null}
      </div>
      <form className="askform" onSubmit={submit}>
        <input ref={input} type="text" placeholder="Ask anything about this role" aria-label="Your question about this role" maxLength={500} value={q} aria-invalid={!!formErr} onChange={(e) => { setQ(e.target.value); setFormErr(null); }} />
        <button className="pill dark" type="submit" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {formErr ? <p className="fielderr" role="alert">{formErr}</p> : null}
      <p className={`sub examples${log.length ? ' gone' : ''}`}>Examples: “What is LangGraph and why would they care?” · “What does owning an incident look like?”</p>
    </div>
  );
}

// Scroll to the first open step and pulse it once.
function goToNext() {
  const el = document.querySelector('.item.todo') as HTMLElement | null; if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  setTimeout(() => (el.querySelector('textarea:not([disabled]), button.pill, input') as HTMLElement | null)?.focus({ preventScroll: true }), 450);
}

const TIPS: Record<string, string> = { ack: 'Facts to know, like budget or location. Tick once you have read them.', study: 'A new must-have or level change. Explain in your own words how you would check it in a screening.', review: 'The client decided on a candidate. See what the screening covered and agree what to check next time.' };
// A module-level component: defining it inside CurrentTab would remount every item (and lose typed text) on each render.
function Sec({ d, title, sub, k, C }: { d: any; title: string; sub: string; k: string; C: (p: { it: any; d: any }) => ReactNode }) {
  const items = d.items.filter((i: any) => i.kind === k);
  if (!items.length) return null;
  return (
    <div>
      <div className="sechead"><h3>{title}<Hint text={TIPS[k]!} /></h3><span className="sub">{`${items.filter((i: any) => i.completion).length} of ${items.length} done · ${sub}`}</span></div>
      {items.map((i: any) => <C key={i.id} it={i} d={d} />)}
    </div>
  );
}

export function CurrentTab({ d }: { d: any }) {
  const due = d.my_progress.done < d.my_progress.total;
  return (
    <div className="two">
      <div>
        <div className={`glass panel${due ? ' due' : ''}`}>
          <h3>Stay current</h3>
          {due
            ? (<div className="duebar"><span><b>{`${d.my_progress.total - d.my_progress.done} step${d.my_progress.total - d.my_progress.done > 1 ? 's' : ''} waiting for you. `}</b>Each takes a minute and keeps your screenings in line with what the client wants now.</span><button className="pill dark" onClick={goToNext}>Start now</button></div>)
            : <p className="sub">{`All done: you have completed ${d.my_progress.total} of ${d.my_progress.total} steps for this position.`}</p>}
        </div>
        <AskPanel d={d} />
        {d.items.length ? null : <p className="sub">Nothing to learn yet: no approved change has created a step.</p>}
        <Sec d={d} title="Confirm" sub="read and acknowledge" k="ack" C={AckItem} />
        <Sec d={d} title="Study" sub="write what you would do" k="study" C={StudyItem} />
        <Sec d={d} title="Review" sub="learn from the client decision" k="review" C={ReviewItem} />
      </div>
      <div>
        <div className="glass panel">
          <h3>Team<Hint text="Up to date means the recruiter completed every step for this position: a confirmation, a written answer or an accepted review." /></h3>
          <p className="sub">Who has learned every approved change.</p>
          {d.team.map((t: any) => (
            <div key={t.id} className={`trow${t.id === d.me ? ' me' : ''}`}>
              <b>{t.name}</b><span className="frac" data-num={`team-${t.id}`}>{`${t.done} of ${t.total}`}</span>
              {t.up_to_date ? <Chip text="Up to date" cls="ok" /> : t.id === d.me ? <button className="pill dark sm" onClick={goToNext}>{`Do it now (${t.pending})`}</button> : <Chip text={`${t.pending} to do`} cls="y" />}
            </div>
          ))}
        </div>
        <VerifyPanel d={d} />
      </div>
    </div>
  );
}
