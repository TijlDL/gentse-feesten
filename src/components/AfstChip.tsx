import { useApp } from '../appContext';
import { afstandTot, loopLabel } from '../lib/geo';
import type { Rij } from '../types';

const LOOP_ICO = (
  <svg viewBox="0 0 12 14" width="10" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6.8" cy="1.9" r="1.5" fill="currentColor" stroke="none" /><path d="M6.6 4.2 5.2 7.4 3.2 12.4M6.6 4.2l2 1.9 2.1.7M5.2 7.4l2.2 1.8.5 3.2M5 6.2 2.6 7.6" /></svg>
);
const HIER_ICO = (
  <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="6" r="5.4" fill="none" stroke="currentColor" strokeWidth="1" opacity=".45" /></svg>
);

/** Wandeltijd-chip naast een rij/plein (alleen met actieve geolocatie). */
export function AfstChip({ row }: { row: Rij }) {
  const { state } = useApp();
  const m = afstandTot(row, state.geo, state.dag);
  if (m == null) return null;
  if (m <= 100) return <span className="afst hier" title={`${m} m in vogelvlucht`}>{HIER_ICO}je bent hier</span>;
  return <span className="afst" title={`${m} m in vogelvlucht`}>{LOOP_ICO}{loopLabel(m)}</span>;
}
