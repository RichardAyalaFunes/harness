'use client';
// Pipeline: moves are never gated by learning data.
import { api, AVATAR_COLORS } from '../../lib/client/format.ts';
import { MoveBody } from '../../lib/contracts/api.ts';
import { useApp } from '../Shell.tsx';

export function PipelineTab({ d, cands }: { d: any; cands: any[] }) {
  const { act } = useApp();
  return (
    <div>
      <p className="sub">Moving a candidate is never blocked by the learning steps. Applied restrictions are shown in the brief only and do not filter candidates.</p>
      <div className="board">
        {d.stages.map((s: string, i: number) => (
          <section key={s} className="glass col" aria-label={s}>
            <h4>{s}<span>{cands.filter((c) => c.stage === i).length}</span></h4>
            {cands.filter((c) => c.stage === i).map((c) => (
              <div key={c.id} className="tile cand" data-cand={c.id}>
                <div className="who">
                  <div className="av" style={{ background: AVATAR_COLORS[c.id % AVATAR_COLORS.length] }}>{c.name.split(/[ .]+/).map((x: string) => x[0]).slice(0, 2).join('')}</div>
                  <div><b>{c.name}</b><small>{s}</small></div>
                </div>
                {i < d.stages.length - 1 ? (
                  <button className="mv" aria-label={`Move ${c.name} to ${d.stages[i + 1]}`}
                    onClick={(e) => act(() => api(`/api/candidates/${c.id}/move`, MoveBody.parse({ to: i + 1 })), `${c.name} moved to ${d.stages[i + 1]}`, { leave: e.currentTarget.closest('.cand'), mark: ['cand', c.id] })}>
                    Next stage →
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
