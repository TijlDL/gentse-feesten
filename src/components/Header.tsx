import { useSyncExternalStore } from 'react';
import { useApp } from '../appContext';
import { loadLive } from '../data/loadLive';
import { getStatus, subscribeStatus } from '../data/store';

export function Header() {
  const { set } = useApp();
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  return (
    <header>
      <button className="searchbtn" id="searchBtn" title="Zoek in alle dagen" aria-label="Zoeken"
        onClick={() => { set({ zoekOpen: true }); setTimeout(() => document.getElementById('zoekIn')?.focus(), 30); }}>
        <svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
      </button>
      <div className="brand">
        <h1>Gentse Feesten<span className="dp">:</span> <span className="jaar">op goe geluk ’26</span></h1>
        <span className="sub">17 – 26 juli · zie in één blik wat er leeft, waar en wanneer</span>
        <div className="demo-pill">
          <span className="dot" /><span id="dataStatus">{status}</span>
          <button id="liveBtn" title="Haalt het programma opnieuw op via data.stad.gent" onClick={() => loadLive()}>Vernieuwen</button>
        </div>
      </div>
    </header>
  );
}
