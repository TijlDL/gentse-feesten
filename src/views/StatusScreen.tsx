import { useSyncExternalStore } from 'react';
import { loadLive } from '../data/loadLive';
import { getStatus, store, subscribeStatus } from '../data/store';

/* ================= LAAD- & FOUTSCHERM ================= */
export function StatusScreen() {
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  if (store.loading) {
    return (
      <div className="loadstate">
        <div className="spin" aria-hidden="true" />
        <p className="lt" id="loadMsg">{/vandaag laden|programma laden/.test(status) ? status : 'Programma laden van data.stad.gent…'}</p>
        <p className="ls">Het volledige programma van de Gentse Feesten 2026 — even geduld.</p>
      </div>
    );
  }
  return (
    <div className="loadstate">
      <p className="lt">Programma kon niet geladen worden</p>
      <p className="ls">{store.loadError}</p>
      <button className="retry" id="retryBtn" onClick={() => loadLive()}>Opnieuw proberen</button>
    </div>
  );
}
