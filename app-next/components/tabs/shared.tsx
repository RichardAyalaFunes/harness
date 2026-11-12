'use client';
import { Chip, Hint } from '../ui.tsx';
import { useSrc } from '../src-context.ts';

export function WeightChip({ w }: { w?: string | null }) {
  switch (w) {
    case 'must': return <Chip text="Must-have" cls="k" tip="The client will not hire without this. Verify it in every screening." />;
    case 'trainable': return <Chip text="Trainable" cls="b" tip="Useful, but the client will teach it on the job. Do not reject a candidate for lacking it." />;
    case 'nice': return <Chip text="Nice to have" cls="g" tip="A plus, never a reason to reject." />;
    case 'proposed': return <Chip text="Proposed, not confirmed by client" cls="ys" tip="Suggested internally; confirm it with the client." />;
    default: return null;
  }
}

export function StatusChips({ f }: { f: any }) {
  return (<>
    {f.status === 'applied' ? <Chip text="Applied (shown here only)" cls="g" /> : null}
    {f.status === 'not_applied_bias' ? <Chip text={`Not applied · possible bias (${f.bias ? f.bias.kind : '?'})`} cls="r" /> : null}
    {f.status === 'pending' ? <Chip text="Pending clarification" cls="ys" /> : null}
    {f.confirmed === false ? <Chip text="Not confirmed by client" cls="ys" /> : null}
    <WeightChip w={f.weight} />
  </>);
}

export function VerifyPanel({ d }: { d: any }) {
  const src = useSrc();
  return (
    <div className="glass panel">
      <h3>What to verify in screenings<Hint text="The must-haves to check in every screening call, plus checks the team agreed after a client decision." /></h3>
      <p className="sub">Informational. It never blocks moving a candidate.</p>
      <span className="grp">Current must-haves</span>
      <ul className="list">
        {d.verify.musts.length ? d.verify.musts.map((m: any) => <li key={m.criterion ?? m.label}><span className="num">✓</span><div>{m.label}<small>{m.value}</small></div></li>) : <li>No must-haves yet.</li>}
      </ul>
      {d.verify.suggestions.length ? <span className="grp">From approved client-decision reviews</span> : null}
      <ul className="list">
        {d.verify.suggestions.map((s: any, i: number) => <li key={i}><span className="num">?</span><div>{s.text}<small>{`${s.why} (${src.name(s.source_id)})`}</small></div></li>)}
      </ul>
    </div>
  );
}
