import { DAYS, START_H } from '../config';
import type { GFEvent } from '../types';

/* Feestdag-venster = 07:00 → 07:00 (+1d). Uren na middernacht = uur + 24. */

export function nuUur(): number {
  const n = new Date();
  let h = n.getHours() + n.getMinutes() / 60;
  if (h < 7) h += 24;
  return h;
}

/** Huidige feestdag (dagnummer), of -1 buiten juli. Vóór 07:00 telt de vorige dag. */
export function vandaagFeestdag(): number {
  const now = new Date();
  return now.getMonth() === 6 ? (now.getHours() < 7 ? now.getDate() - 1 : now.getDate()) : -1;
}

export function fmt(h: number): string {
  let hh = Math.floor(h), mm = Math.round((h % 1) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return String(hh % 24).padStart(2, '0') + '.' + String(mm).padStart(2, '0');
}

export function isPast(e: GFEvent): boolean {
  const now = new Date(); const m = now.getMonth();
  if (m < 6) return false; if (m > 6) return true;
  let d = now.getDate(), h = now.getHours() + now.getMinutes() / 60;
  if (now.getHours() < 7) { d -= 1; h += 24; }
  if (!DAYS.includes(d)) return d > DAYS[DAYS.length - 1];
  if (e.dag < d) return true;
  if (e.dag > d) return false;
  return (e.start + (e.dur ?? 1)) <= h;
}

/** Ligt t op ± ~5 min van het echte "nu" (alleen zinvol als dag = vandaag)? */
export function isNowTime(t: number, dag: number): boolean {
  if (vandaagFeestdag() !== dag) return false;
  let nh = nuUur();
  return Math.abs(t - nh) <= 0.09; /* ± ~5 min */
}

export const initialOf = (e: GFEvent): string => {
  const w = (e.titel || '').trim().split(/\s+/);
  return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '•';
};

export const scoreEv = (e: GFEvent): number =>
  (e.img ? 3 : 0) + (e.descr ? 2 : 0)
  + (['dj', 'rock', 'pop', 'world', 'folk', 'klassiek'].includes(e.genre) ? 2 : 1) + (e.gratis ? 1 : 0);

/** Startdag bij eerste bezoek: vandaag als het feest bezig is, anders 17. */
export function initieleDag(): number {
  const now = new Date();
  let d = now.getDate(), m = now.getMonth();
  if (now.getHours() < 7) d -= 1;
  return (m === 6 && DAYS.includes(d)) ? d : 17;
}
