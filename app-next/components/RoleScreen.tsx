'use client';
// A position: hero, tabs, and the four tab views. All data arrives as props from the server page; every change goes
// through the API (see Shell.act) followed by router.refresh(), so this component never writes to the database.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip, Hint } from './ui.tsx';
import { useApp } from './Shell.tsx';
import { PipelineTab } from './tabs/PipelineTab.tsx';
import { BriefTab } from './tabs/BriefTab.tsx';
import { ChangesTab } from './tabs/ChangesTab.tsx';
import { CurrentTab } from './tabs/CurrentTab.tsx';
import { fmtDate } from '../lib/client/format.ts';
import { SrcCtx } from './src-context.ts';

export const TAB_ORDER = ['pipeline', 'brief', 'changes', 'current'] as const;
type Tab = (typeof TAB_ORDER)[number];

const Kpi = ({ label, value, tip }: { label: string; value: string | number; tip: string }) =>
  <div className="tile kpi"><small>{label}<Hint text={tip} /></small><b data-num={label}>{value}</b></div>;

export function RoleScreen({ d, cands, initialTab }: { d: any; cands: any[]; initialTab: string }) {
  const router = useRouter();
  const app = useApp();
  const [tab, setTab] = useState<Tab>((TAB_ORDER as readonly string[]).includes(initialTab) ? (initialTab as Tab) : 'pipeline');
  const prev = useRef<Tab>(tab);
  const [dir, setDir] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  const nums = useRef<Record<string, string>>({});

  // the address bar is the source of truth after Back/Forward
  useEffect(() => { if ((TAB_ORDER as readonly string[]).includes(initialTab)) setTab(initialTab as Tab); }, [initialTab]);
  useEffect(() => { document.title = `${d.role.title} · RadHires`; }, [d.role.title]);

  const pick = useCallback((t: Tab) => {
    if (t === tab) return;
    setDir(Math.sign(TAB_ORDER.indexOf(t) - TAB_ORDER.indexOf(tab)));
    prev.current = tab;
    setTab(t);
    window.history.pushState(null, '', `/role/${d.role.id}/${t}`);
  }, [tab, d.role.id]);

  // sliding pill behind the active tab: starts under the previous tab, glides to the new one
  useLayoutEffect(() => {
    const el = seg.current; if (!el) return;
    const ind = el.querySelector('.ind') as HTMLElement | null; const on = el.querySelector('button.on') as HTMLElement | null;
    if (!ind || !on) return;
    const at = (b: HTMLElement) => { ind.style.width = `${b.offsetWidth}px`; ind.style.transform = `translateX(${b.offsetLeft}px)`; };
    const from = prev.current !== tab ? (el.querySelector(`button[data-tab="${prev.current}"]`) as HTMLElement | null) : null;
    ind.style.transition = 'none'; at(from || on); ind.getBoundingClientRect(); ind.style.transition = ''; at(on);
    // on phones the tab row scrolls sideways: keep the active tab in view
    if (el.scrollWidth > el.clientWidth) el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [tab]);

  // after the data refreshes: highlight what arrived, and numbers that changed
  useEffect(() => {
    const m = app.takeMark();
    if (m) root.current?.querySelector(`[data-${m[0]}="${m[1]}"]`)?.classList.add(m[0] === 'item' ? 'justdone' : 'arrive');
    root.current?.querySelectorAll<HTMLElement>('[data-num]').forEach((el) => {
      const key = `${d.role.id}|${el.dataset.num}`;
      if (key in nums.current && nums.current[key] !== el.textContent) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      nums.current[key] = el.textContent || '';
    });
  });

  const pend = d.proposals.filter((p: any) => p.state === 'proposed').length + d.reviews.filter((r: any) => r.state === 'proposed').length;
  const myPending = d.items.filter((i: any) => !i.completion).length;
  const lead = d.team.find((t: any) => t.id === d.role.lead);
  const src = useMemo(() => {
    const m = Object.fromEntries(d.timeline.map((s: any) => [s.source_id, s]));
    return { name: (id: string) => (m[id] ? `${m[id].title}, ${fmtDate(m[id].date)}` : id), title: (id: string) => (m[id] ? m[id].title : id) };
  }, [d.timeline]);

  const tabs: [Tab, string, boolean, string][] = [
    ['pipeline', 'Pipeline', false, 'Candidates by stage.'],
    ['brief', 'Role brief', false, 'What the client needs for this role, as approved by the lead recruiter.'],
    ['changes', 'Changes', pend > 0, 'Everything the client sent about this role and what it changed.'],
    ['current', 'Stay current', myPending > 0, 'Short steps so you learn each approved change.'],
  ];

  return (
    <SrcCtx.Provider value={src}>
      <div ref={root} className="screen-in">
        <div className="crumb"><button onClick={() => router.push('/')}>Positions</button> / {d.role.client.name}</div>
        <section className="glass hero">
          <div>
            <div className="title">{d.role.title}</div>
            <p className="sub">{`${d.role.client.name} · lead recruiter ${lead ? lead.name : d.role.lead}`}</p>
            <div className="chips">{d.brief ? null : <Chip text="No approved brief yet" cls="ys" />}{pend ? <Chip text={`${pend} awaiting approval`} cls="y" /> : null}</div>
          </div>
          <div className="kpis">
            <Kpi label="Candidates" value={cands.length} tip="Candidates in this position, across all pipeline stages." />
            <Kpi label="Awaiting approval" value={pend} tip="Changes to the role brief, or lessons from a client decision, that the lead recruiter must approve before the team sees them." />
            <Kpi label="Team up to date" value={`${d.team.filter((t: any) => t.up_to_date).length} of ${d.team.length}`} tip="Recruiters on this position who completed every step in Stay current." />
          </div>
        </section>
        <div className="glass seg" role="tablist" ref={seg}>
          <span className="ind" aria-hidden="true" />
          {tabs.map(([id, label, dot, tip]) => (
            <button key={id} role="tab" data-tab={id} title={tip} aria-selected={id === tab} className={id === tab ? 'on' : ''} onClick={() => pick(id)}>
              {label}{dot ? <span className="n" title="needs attention" /> : null}
            </button>
          ))}
        </div>
        <div key={tab} className={`view${dir ? ' view-in' : ''}`} style={{ ['--dir' as any]: dir }}>
          {tab === 'pipeline' ? <PipelineTab d={d} cands={cands} /> : tab === 'brief' ? <BriefTab d={d} /> : tab === 'changes' ? <ChangesTab d={d} /> : <CurrentTab d={d} />}
        </div>
      </div>
    </SrcCtx.Provider>
  );
}
