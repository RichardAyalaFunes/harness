'use client';
// Small shared UI pieces: chips, the "?" hint (its tooltip floats on <body>, see TipLayer), animated <details>, icons.
import { useEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/client/format.ts';

export function Chip({ text, cls = 'g', tip }: { text: ReactNode; cls?: string; tip?: string }) {
  return <span className={`chip ${cls}`} title={tip}>{text}</span>;
}

export function Hint({ text }: { text: string }) {
  return <span className="hint" tabIndex={0} role="note" aria-label={text} data-tip={text}>?</span>;
}

/** One floating tooltip, shown for any .hint on hover or keyboard focus. Rendered once by the Shell. */
export function TipLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    const show = (el: HTMLElement) => {
      tip.textContent = el.dataset.tip || '';
      tip.classList.add('on');
      const a = el.getBoundingClientRect(); const t = tip.getBoundingClientRect();
      const left = Math.max(8, Math.min(innerWidth - t.width - 8, a.left + a.width / 2 - t.width / 2));
      const below = a.bottom + 8 + t.height < innerHeight;
      tip.style.left = `${left}px`; tip.style.top = `${below ? a.bottom + 8 : a.top - t.height - 8}px`;
    };
    const hide = () => tip.classList.remove('on');
    const over = (e: Event) => { const el = (e.target as HTMLElement).closest?.('.hint') as HTMLElement | null; if (el) show(el); };
    const out = (e: Event) => { if ((e.target as HTMLElement).closest?.('.hint')) hide(); };
    document.addEventListener('mouseover', over); document.addEventListener('focusin', over);
    document.addEventListener('mouseout', out); document.addEventListener('focusout', out);
    addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('mouseover', over); document.removeEventListener('focusin', over); document.removeEventListener('mouseout', out); document.removeEventListener('focusout', out); removeEventListener('scroll', hide, true); };
  }, []);
  return <div ref={ref} className="tipfloat" aria-hidden="true" />;
}

/** <details> whose height eases open and closed. A timeout guarantees the end state even if the browser pauses animations. */
export function Details({ className, summary, open, onToggle, children }: { className?: string; summary: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const det = ref.current!;
    const sum = det.querySelector(':scope > summary') as HTMLElement;
    const click = (e: Event) => {
      e.preventDefault();
      if (det.dataset.anim) return;
      const closing = det.open;
      if (prefersReducedMotion()) { det.open = !closing; onToggle?.(det.open); return; }
      det.dataset.anim = '1';
      const start = det.offsetHeight;
      if (!closing) { det.open = true; onToggle?.(true); }
      const end = closing ? sum.offsetHeight : det.scrollHeight;
      det.style.overflow = 'hidden';
      const a = det.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      let finished = false;
      const fin = () => { if (finished) return; finished = true; a.cancel(); if (closing) { det.open = false; onToggle?.(false); } det.style.overflow = ''; delete det.dataset.anim; };
      a.onfinish = fin; setTimeout(fin, 300);
    };
    sum.addEventListener('click', click);
    return () => sum.removeEventListener('click', click);
  }, [onToggle]);
  return <details ref={ref} className={className} open={open}><summary>{summary}</summary>{children}</details>;
}

export function MicIcon() {
  return (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /><path d="M8 21h8" /></svg>);
}

/** Exit animation: fade, slide and collapse an element before the page data refreshes. Never blocks on a paused animation. */
export function leave(el: Element | null | undefined, dir = 1): Promise<void> {
  const node = el as HTMLElement | null;
  if (!node || prefersReducedMotion()) return Promise.resolve();
  const hgt = node.offsetHeight;
  node.style.overflow = 'hidden';
  const a = node.animate([
    { opacity: 1, transform: 'none', height: `${hgt}px` },
    { opacity: 0, transform: `translateX(${dir * 24}px) scale(.97)`, height: `${hgt}px`, offset: 0.6 },
    { opacity: 0, height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
  ], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  return Promise.race([a.finished.then(() => {}, () => {}), new Promise<void>((res) => setTimeout(res, 360))]);
}

export function shake(el: Element | null | undefined): void {
  if (!el || prefersReducedMotion()) return;
  el.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 320 });
}
