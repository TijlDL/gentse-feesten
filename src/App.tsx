import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppContext, type AppCtx, type PanelInhoud } from './appContext';
import { PLEINEN, START_H } from './config';
import { loadLive } from './data/loadLive';
import { getVersion, store, subscribe } from './data/store';
import { matches } from './lib/filters';
import { initieleDag, nuUur } from './lib/tijd';
import { startVersieWacht } from './lib/versie';
import { DayTabs } from './components/DayTabs';
import { DetailPanel } from './components/DetailPanel';
import { FilterBar } from './components/FilterBar';
import { Header } from './components/Header';
import { KaartView } from './views/KaartView';
import { KaartenView } from './views/KaartenView';
import { MobielView } from './views/MobielView';
import { StatusScreen } from './views/StatusScreen';
import { TijdGrid } from './views/TijdGrid';
import { ZoekView } from './views/ZoekView';
import type { State } from './types';

const MQ = window.matchMedia ? window.matchMedia('(max-width:720px)') : null;

export default function App() {
  const dataVersion = useSyncExternalStore(subscribe, getVersion);
  const [mobiel, setMobiel] = useState(() => !!MQ?.matches);
  const [state, setState] = useState<State>(() => ({
    zoekOpen: false, geo: null, geoBusy: false, dag: initieleDag(),
    genres: new Set<string>(), pleinen: new Set<string>(), paid: false, kids: false,
    q: '', van: null, tot: null, view: MQ?.matches ? 'tijd' : 'kaarten',
  }));
  const [panel, setPanel] = useState<PanelInhoud | null>(null);
  /* liniaal-tijd: ref, geen state — scrubben mag nooit een re-render triggeren */
  const tijdRef = useRef<'nu' | number>('nu');
  const stickyRef = useRef<HTMLDivElement>(null);
  const zoekInRef = useRef<HTMLInputElement>(null);
  const [, bump] = useState(0); /* voor breedte-resizes (her-render zoals vanilla) */

  const set = useCallback((patch: Partial<State>) => setState(s => ({ ...s, ...patch })), []);
  const toggleIn = useCallback((veld: 'genres' | 'pleinen', k: string) => setState(s => {
    const n = new Set(s[veld]); n.has(k) ? n.delete(k) : n.add(k);
    return { ...s, [veld]: n };
  }), []);
  const matchesE = useCallback((e: any) => matches(e, state), [state]);
  const filterSig = [state.dag, [...state.genres].join(','), [...state.pleinen].join(','),
    state.paid, state.kids, state.q, state.van, state.tot, state.geo?.join(';'), dataVersion].join('|');

  /* ---- systeem-effects ---- */
  useEffect(() => { loadLive(); startVersieWacht(); }, []);
  useEffect(() => { MQ?.addEventListener('change', () => setMobiel(MQ.matches)); }, []);
  useEffect(() => { document.body.classList.toggle('zoekmode', state.zoekOpen); }, [state.zoekOpen]);
  useEffect(() => {
    /* sticky-kop-hoogte als CSS-var (mobiele kaart rekent ermee) */
    const h = stickyRef.current; if (!h) return;
    const sync = () => document.documentElement.style.setProperty('--headH', h.offsetHeight + 'px');
    const ro = new ResizeObserver(sync); ro.observe(h); sync();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    /* mobiel: adresbalk-resize is hoogte-only — negeren, anders springt de scroll */
    let _rsz: ReturnType<typeof setTimeout> | null = null, _lastW = window.innerWidth;
    const onR = () => {
      if (window.innerWidth === _lastW) return;
      _lastW = window.innerWidth;
      if (_rsz) clearTimeout(_rsz);
      _rsz = setTimeout(() => { if (!store.loading) bump(n => n + 1); }, 200);
    };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  useEffect(() => {
    /* de nu-lijn tikt via een 30s-hartslag; de klok-state laat óók de
       "bezig"-markeringen (groen) meebewegen — React-reconciliatie behoudt
       scrollposities, de ge-memo'de liniaal wordt niet herbouwd */
    const tik = () => {
      if (document.hidden || store.loading) return;
      const h = Math.min(Math.max(nuUur(), START_H), 31);
      document.querySelectorAll<HTMLElement>('.ruler .rnow').forEach(el => { el.style.left = ((h - START_H) * 110) + 'px'; });
      if ((window as any)._gfNowFix) (window as any)._gfNowFix(h);
      const tr = document.querySelector('.ruler .track');
      if (tr) tr.dispatchEvent(new Event('scroll'));
      bump(n => n + 1);
    };
    const iv = setInterval(tik, 30000);
    /* app heropend na sluimeren: meteen naar het echte "nu" springen */
    const onVis = () => { if (!document.hidden) tik(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  useEffect(() => {
    /* Leaflet-popups en het pleinpaneel openen events via window._gfOpen */
    (window as any)._gfOpen = (id: string) => {
      const e = store.EVENTS.find(x => x.id === id); if (!e) return;
      const R = store.LIVE_ROWS || PLEINEN;
      setPanel({ type: 'event', e, p: R.find(r => r.id === e.plein) || { naam: e.loc || '' } });
    };
    return () => { delete (window as any)._gfOpen; };
  }, []);
  useEffect(() => {
    /* live data raakte niet gekoppeld → diagnosepaneel openen (eenmalig) */
    if (store.diagnose) setPanel(p => p ?? { type: 'diagnose' });
  }, [dataVersion]);

  const sluitZoek = () => { set({ zoekOpen: false, q: '' }); };

  const ctx: AppCtx = {
    state, set, toggleIn, dataVersion, mobiel, tijdRef, matchesE, filterSig,
    panel, openPanel: setPanel, closePanel: () => setPanel(null),
  };

  /* ---- view-dispatch (de oude render()) ---- */
  const ROWS = store.LIVE_ROWS || PLEINEN;
  const dayEvents = useMemo(
    () => store.EVENTS.filter(e => e.dag === state.dag),
    [state.dag, dataVersion]);

  let inhoud: React.ReactNode;
  if (state.zoekOpen) {
    inhoud = <ZoekView />;
  } else if (!store.loading && store.GF_LOADED.size && !store.GF_ALL && !store.GF_LOADED.has(state.dag)) {
    inhoud = <div className="zres"><p className="zhint">Deze dag wordt op de achtergrond geladen… een ogenblik.</p></div>;
  } else if (store.loading || store.loadError) {
    inhoud = <StatusScreen />;
  } else if (state.view === 'kaart') {
    inhoud = <KaartView ROWS={ROWS} dayEvents={dayEvents} stickyEl={stickyRef.current} />;
  } else if (state.view === 'kaarten' && !mobiel) {
    inhoud = <KaartenView ROWS={ROWS} dayEvents={dayEvents} />;
  } else if (mobiel) {
    inhoud = <MobielView ROWS={ROWS} dayEvents={dayEvents} stickyEl={stickyRef.current} />;
  } else {
    inhoud = <TijdGrid ROWS={ROWS} dayEvents={dayEvents} />;
  }
  /* kaarten-view bestaat niet op mobiel */
  useEffect(() => { if (state.view === 'kaarten' && mobiel) set({ view: 'tijd' }); }, [state.view, mobiel, set]);

  const simpelGrid = state.zoekOpen || store.loading || !!store.loadError
    || state.view !== 'tijd' || mobiel
    || (!store.GF_ALL && store.GF_LOADED.size > 0 && !store.GF_LOADED.has(state.dag));

  return (
    <AppContext.Provider value={ctx}>
      <div className="topband" />
      <Header />
      <div className="stickyhead" id="stickyHead" ref={stickyRef}>
        <div className="zoekbar" id="zoekbar">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="var(--gent-gray-medium)" strokeWidth="1.8" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
          <input id="zoekIn" ref={zoekInRef} type="search" placeholder="Zoek artiest of activiteit — alle dagen…" autoComplete="off"
            value={state.q}
            onChange={e => set({ q: e.target.value.toLowerCase() })}
            onKeyDown={e => { if (e.key === 'Escape') sluitZoek(); }} />
          <button className="zclose" id="zoekClose" aria-label="Zoeken sluiten" onClick={sluitZoek}>×</button>
        </div>
        <DayTabs />
        <FilterBar dayEvents={dayEvents} />
      </div>
      <div className="shell">
        <div className="scroller" id="scroller">
          <div className="grid" id="grid" style={simpelGrid ? { minWidth: 0 } : undefined}>
            {inhoud}
          </div>
        </div>
      </div>
      <DetailPanel />
    </AppContext.Provider>
  );
}
