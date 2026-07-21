import type { GFEvent, Rij } from '../types';

/* =================== DATA-STORE (buiten React) ===================
   De data-pijplijn muteert deze module-singletons precies zoals de
   vanilla-app dat deed (fase A/B/C), en roept notify() zodat React
   één keer her-rendert. Progressieve lading blijft zo identiek. */

export const store = {
  EVENTS: [] as GFEvent[],
  LIVE_ROWS: null as Rij[] | null,   // vervangt PLEINEN wanneer live data geladen is
  LIVE_REST: null as GFEvent[] | null, // doorlopende/overige live events voor de strook
  GF_LOADED: new Set<number>(),      // feestdagen waarvan het programma al binnen is
  GF_ALL: false,                     // volledige dataset geladen?
  loading: true,
  loadError: null as string | null,
  /** diagnose-info wanneer records niet gekoppeld raakten (opent het detailpaneel) */
  diagnose: null as null | {
    used: string; recsLength: number;
    keys: Record<string, unknown>; locSamples: string[]; sample: unknown;
  },
};

/* ---- render-notificatie: App bumpt een dataVersion-teller ---- */
let version = 0;
const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getVersion(): number { return version; }
export function notify(): void { version++; listeners.forEach(fn => fn()); }

/* ---- statuslabel (demo-pill + laadscherm): eigen kanaal zodat
       procent-updates tijdens het laden niet de hele app her-renderen ---- */
let statusTekst = 'laden…';
const statusListeners = new Set<() => void>();
export function subscribeStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}
export function getStatus(): string { return statusTekst; }
export function setStatus(t: string): void { statusTekst = t; statusListeners.forEach(fn => fn()); }
