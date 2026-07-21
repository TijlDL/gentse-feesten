import { createContext, useContext } from 'react';
import type { MutableRefObject } from 'react';
import type { GFEvent, Rij, State, StripCat } from './types';

/** Wat het detailpaneel toont (vanilla: openPlein/openEvent/openCategory). */
export type PanelInhoud =
  | { type: 'plein'; p: Rij }
  | { type: 'event'; e: GFEvent; p: { id?: string; naam: string; tag?: string } }
  | { type: 'categorie'; c: StripCat }
  | { type: 'diagnose' };

export interface AppCtx {
  state: State;
  /** setState-patch — het equivalent van "muteer state + render()" */
  set: (patch: Partial<State>) => void;
  /** toggle in een Set-veld (genres/pleinen) — kloont de Set voor React */
  toggleIn: (veld: 'genres' | 'pleinen', k: string) => void;
  dataVersion: number;
  mobiel: boolean;
  /** liniaal-tijd ('nu' of uur) — ref: scrubben her-rendert niet */
  tijdRef: MutableRefObject<'nu' | number>;
  /** gebonden filterpredicaat */
  matchesE: (e: GFEvent) => boolean;
  /** vingerafdruk van alle filters — als deps voor imperatieve rebuilds */
  filterSig: string;
  panel: PanelInhoud | null;
  openPanel: (p: PanelInhoud) => void;
  closePanel: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp buiten AppContext');
  return ctx;
}
