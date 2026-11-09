'use client';
// The frame around every page: side navigation, toast, the "audio is not available" pop-up, the tooltip layer,
// and the shared `act` helper that runs an API call, animates the result, shows a toast and refreshes the page data.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TipLayer, leave } from './ui.tsx';

export interface ActOptions { leave?: Element | null; dir?: number; mark?: [string, number | string] }
interface AppCtx {
  toast: (msg: string, bad?: boolean) => void;
  act: <T>(fn: () => Promise<T>, okMsg?: string, opts?: ActOptions) => Promise<T | undefined>;
  showPop: () => void;
  takeMark: () => [string, number | string] | null;
}
const Ctx = createContext<AppCtx | null>(null);
export const useApp = (): AppCtx => { const c = useContext(Ctx); if (!c) throw new Error('useApp outside Shell'); return c; };

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [toastState, setToast] = useState<{ msg: string; bad: boolean; on: boolean }>({ msg: '', bad: false, on: false });
  const [pop, setPop] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mark = useRef<[string, number | string] | null>(null);

  const toast = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad, on: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), 4500);
  }, []);

  const act = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string, opts: ActOptions = {}) => {
    try {
      const r = await fn();
      if (opts.leave) await leave(opts.leave, opts.dir);
      mark.current = opts.mark ?? null;
      if (okMsg) toast(okMsg);
      router.refresh();
      return r;
    } catch (e: any) {
      toast(e.traceId ? `${e.message} (trace ${e.traceId})` : e.message, true);
      router.refresh();
      return undefined;
    }
  }, [router, toast]);

  const ctx: AppCtx = { toast, act, showPop: () => setPop(true), takeMark: () => { const m = mark.current; mark.current = null; return m; } };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className="side glass">
          <div className="mark" aria-hidden="true">r</div>
          <button className="nb on" id="nav-pos" aria-label="Positions" title="Positions" onClick={() => router.push('/')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
          <div className="foot">Fictional data · prototype</div>
        </aside>
        <main id="main" aria-live="polite">{children}</main>
        <div className={`glass pop${toastState.on ? ' on' : ''}`} id="toast" role="status" style={toastState.bad ? { background: '#fbe1e6' } : undefined}>{toastState.msg}</div>
        <div className={`glass pop${pop ? ' on' : ''}`} id="pop" role="status"><span>Audio answers are not part of this MVP. Please write your answer.</span><button className="pill light" id="pop-ok" onClick={() => setPop(false)}>OK</button></div>
        <TipLayer />
      </div>
    </Ctx.Provider>
  );
}
