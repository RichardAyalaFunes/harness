'use client';
import { useRouter } from 'next/navigation';
import { Chip } from './ui.tsx';
import { useEffect } from 'react';

const STAGES = ['Sourced', 'Screening', 'Client', 'Interview', 'Offer'];

export function PositionsView({ positions }: { positions: any[] }) {
  const router = useRouter();
  const total = positions.reduce((n, p) => n + p.pending_proposals + p.pending_reviews, 0);
  useEffect(() => { document.title = 'Positions · RadHires'; positions.forEach((p) => router.prefetch(`/role/${p.id}/pipeline`)); }, [positions, router]);
  return (
    <div className="screen-in">
      <div className="topbar"><div><p className="h1">Hi Ana</p><div className="title">Positions</div></div><div className="grow" /></div>
      <p className="sub">{total ? `${total} change${total > 1 ? 's' : ''} awaiting approval across your positions.` : 'Nothing awaiting approval.'}</p>
      <div className="cards">
        {positions.map((p) => {
          const pending = p.pending_proposals + p.pending_reviews;
          return (
            <button key={p.id} className="glass pos" onClick={() => router.push(`/role/${p.id}/pipeline`)} aria-label={`Open ${p.title} at ${p.client.name}`}>
              <div className="co">{p.client.name}</div>
              <h3>{p.title}</h3>
              <div className="chips">
                {!p.version ? <Chip text="No brief yet" cls="ys" /> : null}
                {pending ? <Chip text={`${pending} awaiting approval`} cls="y" /> : <Chip text="Nothing pending" cls="g" />}
              </div>
              <div className="stats">
                <div className="tile stat"><small>Team up to date</small><b>{`${p.team.up_to_date} of ${p.team.total}`}</b></div>
                <div className="tile stat"><small>Candidates</small><b>{p.candidates.total}</b></div>
              </div>
              <div className="minibars">{STAGES.map((s, i) => <span key={s}><b>{p.candidates.by_stage[i]}</b>{s}</span>)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
