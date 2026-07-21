import { memo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { END_H, START_H } from '../config';
import { fmt, nuUur, vandaagFeestdag } from '../lib/tijd';
import type { GFEvent } from '../types';

/* ================= TIJD-LINIAAL (mobiel + kaart) =================
   Vrijwel letterlijke poort van buildRuler: DOM + scroll-physics in een
   effect, want scrubben mag nooit door React heen (scrollpositie = bron
   van waarheid). onTime/matchesE gaan via refs zodat het liniaal-DOM niet
   herbouwd wordt bij elke tik van de klok of elke lijst-update. */

interface RulerProps {
  dayEvents: GFEvent[];
  dag: number;
  matchesE: (e: GFEvent) => boolean;
  tijdRef: React.MutableRefObject<'nu' | number>;
  onTime: (t: number) => void;
  /** herbouw-trigger: filters/dag/data gewijzigd */
  filterSig: string;
  /** render de liniaal ergens anders (mobiel: in de sticky kop) */
  portalNaar?: HTMLElement | null;
}

function buildRulerDom(
  dayEvents: GFEvent[], dag: number,
  matchesRef: React.MutableRefObject<(e: GFEvent) => boolean>,
  tijdRef: React.MutableRefObject<'nu' | number>,
  onTimeRef: React.MutableRefObject<(t: number) => void>,
) {
  const isToday = vandaagFeestdag() === dag;
  let nowH = nuUur();
  nowH = Math.min(Math.max(nowH, START_H), END_H);
  const stijd = tijdRef.current;
  const T = (stijd === 'nu' || typeof stijd !== 'number')
    ? (isToday ? nowH : 12)
    : Math.min(Math.max(stijd, START_H), END_H);
  const PXH = 110;
  const ruler = document.createElement('div'); ruler.className = 'ruler';
  ruler.innerHTML = '<div class="nhead"><span class="ntime"></span></div><span class="needle"></span>';
  const track = document.createElement('div'); track.className = 'track';
  const strip = document.createElement('div'); strip.className = 'strip';
  strip.style.width = ((END_H - START_H) * PXH) + 'px';
  /* druktecurve: vloeiende silhouet van de feestdag */
  let maxAct = 1; const acts: number[] = [];
  for (let t = START_H; t < END_H; t += .5) {
    const n = dayEvents.filter(e => matchesRef.current(e) && e.start <= t && t < e.start + e.dur).length;
    acts.push(n); if (n > maxAct) maxAct = n;
  }
  const stripW = (END_H - START_H) * PXH, base = 38, topY = 6;
  const pts = acts.map((n, i) => ({ x: (i + .5) * .5 * PXH, y: n ? base - (3 + (base - topY - 3) * (n / maxAct)) : base }));
  let dp = `M0 ${base} L${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2, my = (pts[i - 1].y + pts[i].y) / 2;
    dp += ` Q${pts[i - 1].x} ${pts[i - 1].y} ${mx} ${my}`;
  }
  dp += ` L${pts[pts.length - 1].x} ${pts[pts.length - 1].y} L${stripW} ${base} Z`;
  const curve = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  curve.setAttribute('class', 'curve');
  curve.setAttribute('viewBox', `0 0 ${stripW} 52`);
  curve.setAttribute('preserveAspectRatio', 'none');
  curve.innerHTML = `<defs><linearGradient id="gfcurve" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#009de0" stop-opacity=".26"/>
      <stop offset="1" stop-color="#009de0" stop-opacity=".03"/></linearGradient></defs>
    <path d="${dp}" fill="url(#gfcurve)" stroke="#009de0" stroke-opacity=".4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  strip.appendChild(curve);
  for (let t = START_H; t <= END_H; t++) {
    const x = (t - START_H) * PXH;
    const tick = document.createElement('span'); tick.className = 'tick';
    tick.style.left = x + 'px'; strip.appendChild(tick);
    const l = document.createElement('span'); l.className = 'hlab';
    l.style.left = x + 'px'; l.textContent = (t % 24) + 'u';
    strip.appendChild(l);
  }
  if (isToday) {
    const nl = document.createElement('span'); nl.className = 'rnow';
    nl.style.left = ((nowH - START_H) * PXH) + 'px';
    strip.appendChild(nl);
  }
  track.appendChild(strip); ruler.appendChild(track);
  let nuBtn: HTMLButtonElement | null = null;
  if (isToday) {
    nuBtn = document.createElement('button');
    nuBtn.className = 'rnowbtn'; nuBtn.type = 'button'; nuBtn.textContent = 'nu ›';
    nuBtn.onclick = e => {
      e.stopPropagation();
      track.scrollTo({ left: (Math.min(Math.max(nuUur(), START_H), END_H) - START_H) * PXH, behavior: 'smooth' });
    };
    ruler.appendChild(nuBtn);
  }
  const ntime = ruler.querySelector('.ntime') as HTMLElement;
  let lastStep: number | null = null, raf = false;
  const applyScroll = () => {
    raf = false;
    const t = Math.min(Math.max(START_H + track.scrollLeft / PXH, START_H), END_H);
    tijdRef.current = t;
    const t5 = Math.round(t * 12) / 12;
    ntime.textContent = fmt(t5) + ' u';
    if (t5 !== lastStep) { lastStep = t5; onTimeRef.current(t5); }
  };
  track.addEventListener('scroll', () => {
    if (nuBtn) {
      const tNu = Math.min(Math.max(nuUur(), START_H), END_H);
      const tZicht = START_H + track.scrollLeft / PXH;
      const diff = tNu - tZicht;                        /* >0: nu ligt rechts (je kijkt naar het verleden) */
      nuBtn.classList.toggle('zicht', Math.abs(diff) > 0.5);
      nuBtn.classList.toggle('links', diff < 0);        /* nu ligt links → chip springt naar links */
      nuBtn.textContent = diff < 0 ? '‹ nu' : 'nu ›';
    } if (!raf) { raf = true; requestAnimationFrame(applyScroll); }
  }, { passive: true });
  /* desktop: slepen met de muis, scrollwiel, en klikken om te springen */
  let dragging = false, moved = 0, startX = 0, startSL = 0;
  track.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (e.pointerType !== 'mouse') return;
    dragging = true; moved = 0; startX = e.clientX; startSL = track.scrollLeft;
    track.setPointerCapture(e.pointerId); track.classList.add('grabbing');
  });
  track.addEventListener('pointermove', e => {
    if (dragging) e.stopPropagation();
    if (!dragging) return;
    const dx = e.clientX - startX; moved = Math.max(moved, Math.abs(dx));
    track.scrollLeft = startSL - dx;
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false; track.classList.remove('grabbing');
    if (moved < 4) { /* klik: spring naar dat tijdstip */
      const rect = track.getBoundingClientRect();
      const xInStrip = track.scrollLeft + (e.clientX - rect.left) - (parseFloat(strip.style.marginLeft) || 0);
      const t = Math.min(Math.max(START_H + xInStrip / PXH, START_H), END_H);
      track.scrollTo({ left: (t - START_H) * PXH, behavior: 'smooth' });
    }
  };
  track.addEventListener('pointerup', e => { e.stopPropagation(); endDrag(e); });
  track.addEventListener('pointercancel', () => { dragging = false; track.classList.remove('grabbing'); });
  track.addEventListener('wheel', e => {
    track.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    e.preventDefault();
  }, { passive: false });
  const mount = () => {
    const pad = Math.round(track.clientWidth / 2) || 180;
    strip.style.marginLeft = pad + 'px'; strip.style.marginRight = pad + 'px';
    const t5 = Math.round(T * 12) / 12;
    ntime.textContent = fmt(t5) + ' u';
    lastStep = t5; onTimeRef.current(t5);
    track.scrollLeft = (T - START_H) * PXH;
  };
  return { el: ruler, mount };
}

export const Ruler = memo(function Ruler({ dayEvents, dag, matchesE, tijdRef, onTime, filterSig, portalNaar }: RulerProps) {
  const host = useRef<HTMLDivElement>(null);
  const matchesRef = useRef(matchesE); matchesRef.current = matchesE;
  const onTimeRef = useRef(onTime); onTimeRef.current = onTime;
  useEffect(() => {
    const el = host.current; if (!el) return;
    const r = buildRulerDom(dayEvents, dag, matchesRef, tijdRef, onTimeRef);
    el.appendChild(r.el);
    r.mount();
    return () => { el.innerHTML = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayEvents, dag, filterSig]);
  const node = <div ref={host} className="rulerhost" />;
  return portalNaar ? createPortal(node, portalNaar) : node;
}, (prev, next) => prev.dayEvents === next.dayEvents && prev.dag === next.dag
  && prev.filterSig === next.filterSig && prev.portalNaar === next.portalNaar);
