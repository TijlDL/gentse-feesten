import { store } from '../data/store';
import { fmt } from './tijd';
import type { GFEvent, StripCat } from '../types';

/** Categorieën voor de "doorlopend & elders"-strook van één feestdag. */
export function stripCatsFor(dag: number): StripCat[] {
  if (!store.LIVE_REST) return [];
  const todays = store.LIVE_REST.filter(e => e.dag === dag);
  const byCat: Record<string, GFEvent[]> = {};
  todays.forEach(e => { (byCat[e.cat || 'Doorlopend & elders'] ||= []).push(e); });
  return Object.entries(byCat).map(([cat, list]) => ({
    cat, n: list.length,
    items: list.sort((a, b) => a.start - b.start).slice(0, 30)
      .map(e => ({ tt: fmt(e.start) + ' u', nm: e.titel + (e.loc ? ' — ' + e.loc : '') })),
  }));
}
