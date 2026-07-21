import { useEffect, useLayoutEffect, useRef } from 'react';
import { useApp } from '../appContext';
import { DAYS, DOW } from '../config';
import { vandaagFeestdag } from '../lib/tijd';

/* Mobiel gedraagt de dagbalk zich als picker (zelfde paradigma als de
   tijd-liniaal): de actieve dag staat in het midden, tikken schuift die
   dag naar het midden, en na het swipen wordt de dag die het dichtst bij
   het midden ligt actief. Op desktop passen alle dagen — geen picker. */

export function DayTabs() {
  const { state, set, tijdRef, mobiel } = useApp();
  const navRef = useRef<HTMLElement>(null);
  const dagRef = useRef(state.dag); dagRef.current = state.dag;
  const todayFest = vandaagFeestdag();

  const centreer = (d: number, smooth: boolean) => {
    const nav = navRef.current;
    if (!nav || !nav.clientWidth) return; /* verborgen (zoekmode): niets te meten */
    const btn = nav.querySelector<HTMLButtonElement>(`button[data-dag="${d}"]`);
    if (!btn) return;
    const doel = btn.offsetLeft + btn.offsetWidth / 2 - nav.clientWidth / 2;
    nav.scrollTo({ left: doel, behavior: smooth ? 'smooth' : 'auto' });
  };

  /* dag gewisseld (tik, of activatie na swipe): vloeiend naar het midden */
  useEffect(() => { if (mobiel) centreer(state.dag, true); }, [state.dag, mobiel]);
  /* eerste render + terug uit zoekmodus: meteen goed zetten, zonder animatie */
  useLayoutEffect(() => { if (mobiel && !state.zoekOpen) centreer(state.dag, false); }, [mobiel, state.zoekOpen]);

  /* handmatig swipen: tijdens het scrollen krijgt het midden alvast de
     active-state (louter visueel, geen re-render); komt de scroll tot rust,
     dan wordt die dag écht actief */
  useEffect(() => {
    if (!mobiel) return;
    const nav = navRef.current; if (!nav) return;
    let t: ReturnType<typeof setTimeout> | null = null, raf = false;
    const middenste = (): HTMLButtonElement | null => {
      const midden = nav.scrollLeft + nav.clientWidth / 2;
      let beste: HTMLButtonElement | null = null, besteAfst = Infinity;
      nav.querySelectorAll<HTMLButtonElement>('button.day').forEach(b => {
        const a = Math.abs(b.offsetLeft + b.offsetWidth / 2 - midden);
        if (a < besteAfst) { besteAfst = a; beste = b; }
      });
      return beste;
    };
    const onScroll = () => {
      if (!raf) {
        raf = true;
        requestAnimationFrame(() => {
          raf = false;
          const b = middenste(); if (!b) return;
          if (!b.classList.contains('active')) {
            nav.querySelectorAll('.day.active').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); /* React zet dit bij de settle-render definitief goed */
          }
        });
      }
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const b = middenste();
        const d = b ? +(b as HTMLButtonElement).dataset.dag! : null;
        if (d && d !== dagRef.current) { tijdRef.current = 'nu'; set({ dag: d }); }
        else if (d) centreer(d, true); /* zelfde dag, net naast het midden losgelaten: netjes uitlijnen */
      }, 140);
    };
    nav.addEventListener('scroll', onScroll, { passive: true });
    return () => { nav.removeEventListener('scroll', onScroll); if (t) clearTimeout(t); };
  }, [mobiel, set, tijdRef]);

  return (
    <nav className="days" id="dayTabs" aria-label="Kies een feestdag" ref={navRef}>
      {DAYS.map(d => (
        <button key={d} data-dag={d}
          className={'day' + (d === state.dag ? ' active' : '') + (d === todayFest ? ' today' : '')}
          title={d === 26 ? 'De dag van de lege portemonneekes' : undefined}
          onClick={() => { tijdRef.current = 'nu'; set({ dag: d }); }}>
          <span className="dow">{DOW[d]}</span><span className="dnum">{d}</span>
          {d === 26 && <span className="ptm" aria-hidden="true">💸</span>}
        </button>
      ))}
    </nav>
  );
}
