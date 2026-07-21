import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../appContext';
import { END_H, GENRES, PLEINEN, START_H } from '../config';
import { store } from '../data/store';
import { fmt } from '../lib/tijd';
import type { GFEvent, View } from '../types';

type DropId = 'P' | 'T' | 'M';

/** Uur-opties voor de tijd-selects (— = geen grens). */
function UurOpts({ from }: { from: number }) {
  const opts = [];
  for (let h = from; h <= END_H; h++) opts.push(<option key={h} value={h}>{h % 24}u</option>);
  return <><option value="">—</option>{opts}</>;
}

export function FilterBar({ dayEvents }: { dayEvents: GFEvent[] }) {
  const { state, set, toggleIn, matchesE } = useApp();
  const [open, setOpen] = useState<DropId | null>(null);
  const [geoLbl, setGeoLbl] = useState('In de buurt');
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* buiten klikken sluit de dropdowns */
  useEffect(() => {
    const close = () => setOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  /* paneel binnen het scherm houden: meten bij openen, flippen als het uitsteekt */
  useLayoutEffect(() => {
    if (!open) return;
    const pn = panelRefs.current[open];
    if (!pn) return;
    pn.classList.remove('flip');
    if (pn.getBoundingClientRect().right > window.innerWidth - 8) pn.classList.add('flip');
  }, [open]);

  const visible = dayEvents.filter(matchesE);
  const restCount = store.LIVE_REST ? store.LIVE_REST.filter(e => e.dag === state.dag).length : 0;

  const win = state.van != null || state.tot != null;
  const uur = (t: number | null) => t == null ? null : (t % 1 ? fmt(t) : (t % 24) + 'u');
  const nActief = state.genres.size + state.pleinen.size + (state.paid ? 1 : 0) + (state.kids ? 1 : 0);

  const syncVan = (v: string, t: string) => {
    let van = v ? +v : null, tot = t ? +t : null;
    if (van != null && tot != null && tot <= van) tot = null;
    set({ van, tot });
  };
  const wisTijd = () => set({ van: null, tot: null });

  const geoKlik = () => {
    if (state.geo) { set({ geo: null }); return; }
    if (state.geoBusy || !navigator.geolocation) return;
    set({ geoBusy: true }); setGeoLbl('zoeken…');
    navigator.geolocation.getCurrentPosition(
      pos => { setGeoLbl('In de buurt'); set({ geoBusy: false, geo: [pos.coords.latitude, pos.coords.longitude] }); },
      () => {
        set({ geoBusy: false }); setGeoLbl('geen toegang');
        setTimeout(() => setGeoLbl('In de buurt'), 2500); /* overgangs- én faaltekst ruimen zichzelf op */
      },
      { timeout: 8000, maximumAge: 60000 });
  };

  const toggleDrop = (id: DropId) => (e: React.MouseEvent) => { e.stopPropagation(); setOpen(o => o === id ? null : id); };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const cnt = (n: number) => n > 0 && <span className="gcount" style={{ display: 'inline-block' }}>{n}</span>;

  return (
    <div className="filters" id="filterBar">
      <span className="count" id="countLabel"><b>{visible.length}</b> op de pleinen · <b>{restCount}</b> doorlopend &amp; elders</span>
      <span className="sep" />
      <div className={'gdrop' + (open === 'P' ? ' open' : '')}>
        <button className={'chip gbtn' + (state.pleinen.size ? ' on' : '')} id="gbtnP" onClick={toggleDrop('P')}>
          Pleinen{cnt(state.pleinen.size)}<span className="car">▾</span></button>
        <div className="gpanel" id="gpanelP" ref={el => { panelRefs.current.P = el; }} onClick={stop}>
          {[...PLEINEN].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')).map(pl => (
            <button key={pl.id} className={state.pleinen.has(pl.id) ? 'on' : ''} onClick={() => toggleIn('pleinen', pl.id)}>
              <span className="sw2" style={{ background: 'var(--gent-blue)' }} />{pl.naam}<span className="ck">✓</span></button>
          ))}
          <button className="gclear" onClick={() => set({ pleinen: new Set() })}>Wis pleinen</button>
        </div>
      </div>
      <div className="tinline" id="tinline">
        van <select id="selVan" value={state.van ?? ''} onChange={e => syncVan(e.target.value, String(state.tot ?? ''))}><UurOpts from={START_H - 1} /></select>
        {' '}tot <select id="selTot" value={state.tot ?? ''} onChange={e => syncVan(String(state.van ?? ''), e.target.value)}><UurOpts from={START_H} /></select>
        <button className="tclearx" id="tclearx" hidden={!win} title="Tijdsfilter wissen" onClick={wisTijd}>×</button>
      </div>
      <div className={'gdrop' + (open === 'T' ? ' open' : '')} id="tdrop">
        <button className={'chip gbtn' + (win ? ' on' : '')} id="tbtn" onClick={toggleDrop('T')}>
          {win ? `${uur(state.van) ?? '…'} – ${uur(state.tot) ?? 'einde'}` : 'Tijd'}<span className="car">▾</span></button>
        <div className="gpanel" id="tpanel" ref={el => { panelRefs.current.T = el; }} onClick={stop}>
          <p className="gsec">Toon enkel tussen</p>
          <div className="gtijd">
            van <select id="selVanM" value={state.van ?? ''} onChange={e => syncVan(e.target.value, String(state.tot ?? ''))}><UurOpts from={START_H - 1} /></select>
            {' '}tot <select id="selTotM" value={state.tot ?? ''} onChange={e => syncVan(String(state.van ?? ''), e.target.value)}><UurOpts from={START_H} /></select>
          </div>
          <button className="gclear" onClick={wisTijd}>Wis tijdsvenster</button>
        </div>
      </div>
      <div className={'gdrop' + (open === 'M' ? ' open' : '')}>
        <button className={'chip gbtn' + ((state.paid || state.kids || state.genres.size) ? ' on' : '')} id="gbtnM" onClick={toggleDrop('M')}>
          Meer{cnt((state.paid ? 1 : 0) + (state.kids ? 1 : 0) + state.genres.size)}<span className="car">▾</span></button>
        <div className="gpanel" id="gpanelM" ref={el => { panelRefs.current.M = el; }} onClick={stop}>
          <button className={state.paid ? 'on' : ''} onClick={() => set({ paid: !state.paid })}>
            <span className="sw2" style={{ background: 'var(--gent-orange)' }} />Ook betalend · €<span className="ck">✓</span></button>
          <button className={state.kids ? 'on' : ''} onClick={() => set({ kids: !state.kids })}>
            <span className="sw2" style={{ background: 'var(--gent-red-pastel)' }} />Met kinderen<span className="ck">✓</span></button>
          <p className="gsec">Genres</p>
          {Object.entries(GENRES).map(([k, g]) => (
            <button key={k} className={state.genres.has(k) ? 'on' : ''} onClick={() => toggleIn('genres', k)}>
              <span className="sw2" style={{ background: g.c }} />{g.label}<span className="ck">✓</span></button>
          ))}
          <button className="gclear" onClick={() => set({ genres: new Set(), pleinen: new Set(), paid: false, kids: false, van: null, tot: null })}>Alles wissen</button>
        </div>
      </div>
      <button className="reset" id="resetBtn" hidden={!(nActief || win || state.q)}
        onClick={() => set({ genres: new Set(), pleinen: new Set(), paid: false, kids: false, q: '', van: null, tot: null })}>wis filters</button>
      {/* op mobiel één volle rij: geo-knop links, weergave-toggle rechts (space-between);
          op desktop is deze wrapper onzichtbaar (display:contents) */}
      <div className="georij">
      <button className={'chip geobtn' + (state.geo ? ' on' : '')} id="geoBtn"
        title="Sorteer op wat dichtbij is — je locatie blijft op je toestel" onClick={geoKlik}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="4.5" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /><path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15" strokeLinecap="round" /></svg>
        <span id="geoLbl">{state.geoBusy ? 'zoeken…' : geoLbl}</span>
      </button>
      <div className="viewswitch" role="tablist" aria-label="Weergave">
        {([['tijd', 'Tijdlijn'], ['kaarten', 'Programma per locatie (experimenteel)'], ['kaart', 'Kaart']] as [View, string][]).map(([v, titel]) => (
          <button key={v} data-v={v} className={(state.view || 'tijd') === v ? 'on' : ''} title={titel} aria-label={titel}
            onClick={() => set({ view: v })}>
            {v === 'tijd' && <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4h8M2 8h12M2 12h6" /></svg>}
            {v === 'kaarten' && <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>}
            {v === 'kaart' && <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M8 14.2S3.5 9.8 3.5 6.8a4.5 4.5 0 1 1 9 0c0 3-4.5 7.4-4.5 7.4z" /><circle cx="8" cy="6.8" r="1.6" /></svg>}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}
