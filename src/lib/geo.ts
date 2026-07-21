import type { Coord, Rij } from '../types';

/* wandelafstand: vogelvlucht × 1,3 (omwegfactor binnenstad), 78 m/min staptempo */

/** Meters (vogelvlucht) van `geo` tot de dichtstbijzijnde plek van rij `row` op dag `dag`. */
export function afstandTot(row: Rij, geo: Coord | null, dag: number): number | null {
  if (!geo || !row) return null;
  const d1 = (c: Coord) => {
    const R = 111320, dy = (geo[0] - c[0]) * R, dx = (geo[1] - c[1]) * R * Math.cos(c[0] * Math.PI / 180);
    return Math.round(Math.hypot(dx, dy));
  };
  const pts = row.dagPts && row.dagPts[dag];
  if (pts && pts.length) return Math.min(...pts.map(d1));   /* dichtstbijzijnde plek van vandaag */
  const c = (row.dagCoord && row.dagCoord[dag])
    || (window._GF_LOCGEO && row.naam ? window._GF_LOCGEO.get((row.naam + '').toLowerCase().trim()) : null)
    || (window._GF_KAL_COORDS && window._GF_KAL_COORDS[row.id]);
  return c ? d1(c) : null;
}

export function loopLabel(m: number | null): string {
  if (m == null) return '';
  const min = Math.max(1, Math.round(m * 1.3 / 78));
  return '± ' + min + ' min';
}

/** Is de sublocatie-naam informatief naast de pleinnaam? (anders niet tonen) */
export function sublocNodig(loc: string | null | undefined, naam: string | null | undefined): boolean {
  if (!loc || !naam) return false;
  const norm = (x: string) => (x + '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const stam = (t: string) => t.replace(/(markt|plein|park|hof|straat|kaai|lei)$/, '') || t;
  const ART = new Set(['de', 'het', 't', 'den', 'van', 'der']);
  const tok = (x: string) => norm(x).split(' ').filter(w => w && !ART.has(w)).map(stam);
  const pt = new Set(tok(naam));
  const rest = tok(loc).filter(w => !pt.has(w));
  return rest.length > 0;   /* alleen tonen als er iets échts overblijft */
}
