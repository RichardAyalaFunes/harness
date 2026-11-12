'use client';
import { useEffect, useRef, useState } from 'react';
import { Chip, Hint } from '../ui.tsx';
import { fmtDate, prefersReducedMotion, wait } from '../../lib/client/format.ts';
import { useSrc } from '../src-context.ts';
import { StatusChips, VerifyPanel } from './shared.tsx';

const sig = (f: any) => `${f.value}|${f.weight || ''}`;

export function BriefTab({ d }: { d: any }) {
  const src = useSrc();
  const [selected, setSelected] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [prev, setPrev] = useState<Map<string, string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!d.brief) return <div className="glass panel">No approved brief yet. Approve a proposal in Changes.</div>;
  const cur = d.brief.version;
  const sel = d.versions.find((v: any) => v.n === selected) || d.versions.find((v: any) => v.n === cur);
  const isCur = sel.n === cur;
  const fields: any[] = isCur ? d.brief.fields : sel.fields;
  const groups = [...new Set(fields.map((f) => f.group))];

  const pick = async (n: number) => {
    if (n === sel.n) return;
    const targetFields: any[] = n === cur ? d.brief.fields : d.versions.find((v: any) => v.n === n).fields;
    const target = new Map(targetFields.map((f) => [f.field, sig(f)]));
    // rows missing from the target collapse out; then the target renders and new or changed rows ease in
    setLeaving(new Set(fields.filter((f) => !target.has(f.field)).map((f) => f.field)));
    setSwapping(true);
    const before = new Map(fields.map((f) => [f.field, sig(f)]));
    await wait(200, prefersReducedMotion());
    setSelected(n); setLeaving(new Set()); setSwapping(false); setPrev(before);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPrev(null), 800);
  };

  const rowClass = (f: any) => {
    let c = 'r';
    if (f.changed_in_version === sel.n) c += ' chg';
    if (leaving.has(f.field)) c += ' leaving';
    if (prev) c += !prev.has(f.field) ? ' entering' : prev.get(f.field) !== sig(f) ? ' changing' : ' settle';
    return c;
  };

  return (
    <div className="two">
      <div className="glass panel">
        <h3>{isCur ? 'Role brief' : `Role brief as of ${fmtDate(sel.effective_date)}`}<Hint text="The approved picture of what the client needs. It changes only when the lead recruiter approves a change in the Changes tab." /></h3>
        {isCur
          ? <p className="sub">{`Current. Last updated ${fmtDate(sel.effective_date)} after: ${src.title(sel.source_id)}. Highlighted rows changed in that update.`}</p>
          : (<div className="oldver"><span><b>Older version. </b>{`This is how the brief looked after ${src.name(sel.source_id)}. It is no longer current.`}</span><button className="pill dark" onClick={() => pick(cur)}>Back to current</button></div>)}
        {groups.map((g) => (
          <div key={g}>
            <span className="grp">{g}</span>
            <div className={`rows${swapping ? ' swapping' : ''}`}>
              {fields.filter((f) => f.group === g).map((f) => (
                <div key={f.field} data-field={f.field} className={rowClass(f)}>
                  <div className="k">{f.label}</div>
                  <div className="v">
                    {f.value}
                    <div className="chips"><StatusChips f={f} /></div>
                    {f.bias ? <small>{f.bias.note}</small> : null}
                    <small>{`${src.name(f.source_id)} · “${f.quote}”`}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="glass panel">
          <h3>History<Hint text="Each time an approved client change updated this brief. Click one to see the brief as it was then." /></h3>
          <ul className="list vers">
            {d.versions.slice().reverse().map((v: any) => (
              <li key={v.n}>
                <button className={`verb${v.n === sel.n ? ' on' : ''}`} aria-pressed={v.n === sel.n} onClick={() => pick(v.n)}>
                  <span><b>{fmtDate(v.effective_date)}</b><small>{src.title(v.source_id)}</small></span>
                  {v.n === cur ? <Chip text="Current" cls="ok" /> : <span className="go">View →</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <VerifyPanel d={d} />
      </div>
    </div>
  );
}
