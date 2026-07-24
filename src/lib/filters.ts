import type { GFEvent, State } from '../types';

/** Het centrale filterpredicaat — pure functie van event + state. */
export function matches(e: GFEvent, state: State): boolean {
  if (state.van != null && e.start + e.dur <= state.van) return false;
  if (state.tot != null && e.start >= state.tot) return false;
  if (state.genres.size && !state.genres.has(e.genre)) return false;
  if (state.pleinen.size && !state.pleinen.has(e.plein as string)) return false;
  if (state.gratisOnly && !e.gratis) return false; /* standaard tonen we alles; betalend is met € gemarkeerd */
  if (state.kids && !e.kids) return false;
  const q = state.q.trim();
  if (q && !e.titel.toLowerCase().includes(q)) return false;
  return true;
}
