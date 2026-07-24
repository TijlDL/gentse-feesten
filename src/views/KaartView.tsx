import { useEffect, useRef, useState } from 'react';
import { useApp } from '../appContext';
import { Ruler } from '../components/Ruler';
import { GENRES } from '../config';
import { ensureLeaflet } from '../lib/leaflet';
import { fmt } from '../lib/tijd';
import type { Coord, GFEvent, Rij } from '../types';

/* ================= KAARTWEERGAVE ================= */

/** HTML-escape voor de Leaflet-popups: locatienamen/titels komen uit de open
    data (organisator-ingevoerd) en worden als HTML-string aan Leaflet gegeven,
    dus escapen we ze om DOM-XSS uit te sluiten. */
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** enkel dataset-posities: dag-anker -> locatie-record -> gekalibreerd anker; anders geen marker */
function rowCoords(p: Rij, dag: number): Coord | null {
  const geo = window._GF_LOCGEO, kal = window._GF_KAL_COORDS;
  return (p.dagCoord && p.dagCoord[dag])
    || (geo && geo.get((p.naam || '').toLowerCase().trim()))
    || (kal && kal[p.id]) || null;
}

export function KaartView({ ROWS, dayEvents, stickyEl }: { ROWS: Rij[]; dayEvents: GFEvent[]; stickyEl: HTMLElement | null }) {
  const { state, matchesE, tijdRef, filterSig, mobiel } = useApp();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const lastT = useRef<number | null>(null);
  const [kaartFout, setKaartFout] = useState(false);
  /* verse waarden voor de update-callback (ruler-DOM herbouwt niet mee) */
  const vers = useRef({ ROWS, dayEvents, matchesE, dag: state.dag, mobiel });
  vers.current = { ROWS, dayEvents, matchesE, dag: state.dag, mobiel };

  const updateMarkers = (t: number) => {
    lastT.current = t;
    const MAP = mapRef.current, MARKLAYER = layerRef.current;
    if (!MAP || !MARKLAYER) return;
    const L = window.L;
    const { ROWS, dayEvents, matchesE, dag, mobiel } = vers.current;
    MARKLAYER.clearLayers();
    ROWS.forEach(p => {
      const c = rowCoords(p, dag); if (!c) return;
      const evs = dayEvents.filter(e => e.plein === p.id && matchesE(e)).sort((a, b) => a.start - b.start);
      const bezig = evs.filter(e => e.start <= t && t < e.start + e.dur);
      const straks = evs.filter(e => e.start > t && e.start <= t + 2.5).slice(0, 3);
      if (!evs.length) return;
      const n = bezig.length;
      const col = n ? GENRES[bezig[0].genre].c : '';
      const size = n ? 32 + Math.min(n, 4) * 4 : 22;
      const icon = L.divIcon({
        className: 'gmark-wrap',
        html: `<div class="gmark${n ? '' : ' idle'}" style="${n ? `--c:${col};` : ''}width:${size}px;height:${size}px">${n || ''}</div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
      });
      const m = L.marker(c, { icon }).addTo(MARKLAYER);
      const rows = [...bezig.map(e => ({ e, b: 1 })), ...straks.map(e => ({ e, b: 0 }))].slice(0, 5)
        .map(({ e }) => `<button class="krow" onclick="window._gfOpen('${esc(e.id)}')">`
          + `<span class="kdot" style="--c:${GENRES[e.genre].c}"></span><b>${fmt(e.start)}</b> ${esc(e.titel)}</button>`).join('');
      m.bindPopup(`<div class="kpop"><h4>${esc(p.naam)}</h4>${rows || '<p class="kleeg">Niets rond dit uur</p>'}</div>`,
        { closeButton: false, maxWidth: 280 });
      if (!mobiel) m.bindTooltip(esc(p.naam), { direction: 'top', offset: [0, -size / 2 - 2] });
    });
  };

  useEffect(() => {
    let weg = false;
    ensureLeaflet().then(() => {
      if (weg || !mapDivRef.current) return;
      const L = window.L;
      const MAP = L.map(mapDivRef.current).setView(state.geo || [51.0555, 3.7255], 15);
      if (state.geo) {
        L.circleMarker(state.geo, { radius: 8, color: '#fff', weight: 2.5, fillColor: '#005ba9', fillOpacity: 1 })
          .bindPopup('Jij bent hier').addTo(MAP);
        L.circle(state.geo, { radius: 45, color: '#005ba9', weight: 1, fillOpacity: .08, opacity: .4 }).addTo(MAP);
      }
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(MAP);
      mapRef.current = MAP;
      layerRef.current = L.layerGroup().addTo(MAP);
      /* markers meteen op de huidige liniaal-tijd zetten */
      if (lastT.current != null) updateMarkers(lastT.current);
    }).catch(() => { if (!weg) setKaartFout(true); });
    return () => {
      weg = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.geo]);

  /* filters/dag/data gewijzigd → markers verversen op de huidige tijd */
  useEffect(() => { if (lastT.current != null) updateMarkers(lastT.current); }, [filterSig]);

  return (
    <div className="kwrap">
      <Ruler dayEvents={dayEvents} dag={state.dag} matchesE={matchesE} tijdRef={tijdRef}
        onTime={updateMarkers} filterSig={filterSig} portalNaar={mobiel ? stickyEl : undefined} />
      <div id="kmap" ref={mapDivRef}>
        {kaartFout && (
          <div className="loadstate"><p className="lt">Kaart kon niet laden</p>
            <p className="ls">Leaflet of OpenStreetMap is niet bereikbaar in deze omgeving — open de pagina lokaal in je browser.</p></div>
        )}
      </div>
    </div>
  );
}
