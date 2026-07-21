import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../appContext';
import { DOW, END_H, GENRES, START_H } from '../config';
import { store } from '../data/store';
import { stripCatsFor } from '../lib/strip';
import { fmt, scoreEv, vandaagFeestdag, nuUur } from '../lib/tijd';
import type { GFEvent, Rij } from '../types';

/* ================= HET TIJDRASTER (desktop) =================
   Structuur in JSX; gedrag (brush, crosshair, elders-zichtbaarheid,
   nu-lijn-hartslag, elastische uurbreedte) imperatief via effects —
   exact de vanilla-logica. */

const LANE_H = 38, LANE_GAP = 4, PAD = 7;

function labelW(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--labelW'));
}

export function TijdGrid({ ROWS, dayEvents }: { ROWS: Rij[]; dayEvents: GFEvent[] }) {
  const { state, set, matchesE, filterSig, dataVersion, openPanel } = useApp();
  const [hourW, setHourW] = useState(88);
  const crossRef = useRef<HTMLDivElement>(null);
  const nowlineRef = useRef<HTMLDivElement>(null);

  const xPos = (h: number) => labelW() + (h - START_H) * hourW;

  /* elastische uurbreedte: vul de volledige beschikbare breedte, 88px/u minimum */
  useLayoutEffect(() => {
    const scroller = document.getElementById('scroller')!;
    const meet = () => {
      const availW = scroller.clientWidth - labelW() - 2;
      setHourW(Math.max(88, Math.floor((availW / (END_H - START_H)) * 100) / 100));
    };
    meet();
    const ro = new ResizeObserver(meet); ro.observe(scroller);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const grid = document.getElementById('grid')!;
    grid.style.setProperty('--hourW', hourW + 'px');
    return () => { grid.style.removeProperty('--hourW'); };
  }, [hourW]);

  /* elders-rijen: verberg wat buiten het zichtbare tijdsvenster valt */
  useEffect(() => {
    const scr2 = document.getElementById('scroller')!;
    const grid = document.getElementById('grid')!;
    const updateEldersVis = () => {
      const t0 = START_H + Math.max(0, scr2.scrollLeft) / hourW;
      const t1 = START_H + (scr2.scrollLeft + scr2.clientWidth - labelW()) / hourW;
      let any = false;
      grid.querySelectorAll<HTMLElement>('.eldersrow').forEach(r => {
        const vis = +r.dataset.tmax! > t0 && +r.dataset.tmin! < t1;
        r.style.display = vis ? '' : 'none';
        if (vis) any = true;
      });
      const eh = document.getElementById('eldersHead');
      if (eh) eh.style.display = any ? '' : 'none';
    };
    let _evT: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => { if (_evT) clearTimeout(_evT); _evT = setTimeout(updateEldersVis, 90); };
    scr2.addEventListener('scroll', onScroll);
    const raf = requestAnimationFrame(updateEldersVis); /* na het bouwen van de rijen */
    return () => { scr2.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); if (_evT) clearTimeout(_evT); };
  }, [hourW, filterSig]);

  /* brush: sleep over de achtergrond om een tijdsvenster te kiezen */
  useEffect(() => {
    const grid = document.getElementById('grid')!;
    let brushing: { x0: number; x1?: number } | null = null, tempBand: HTMLDivElement | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t && t.closest && t.closest('.ruler,.ev,.rowlabel,.pill,.timehead,.selband,button,select,input')) return;
      const rect = grid.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x <= labelW()) return;
      brushing = { x0: x };
      grid.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!brushing) return;
      const rect = grid.getBoundingClientRect();
      const x = Math.max(labelW(), e.clientX - rect.left);
      brushing.x1 = x;
      if (Math.abs(x - brushing.x0) > 6) {
        if (!tempBand) { tempBand = document.createElement('div'); tempBand.className = 'selband'; grid.appendChild(tempBand); }
        const l = Math.min(brushing.x0, x), w = Math.abs(x - brushing.x0);
        tempBand.style.left = l + 'px'; tempBand.style.width = w + 'px';
      }
    };
    const up = () => {
      if (!brushing) return;
      const { x0, x1 } = brushing; brushing = null;
      if (tempBand) { tempBand.remove(); tempBand = null; }
      const toT = (x: number) => Math.round((START_H + (x - labelW()) / hourW) * 4) / 4; /* kwartier-raster */
      if (x1 != null && Math.abs(x1 - x0) > 10) {
        set({
          van: Math.max(START_H, Math.min(toT(x0), toT(x1))),
          tot: Math.min(END_H, Math.max(toT(x0), toT(x1))),
        });
      }
    };
    grid.addEventListener('pointerdown', down);
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', up);
    return () => {
      grid.removeEventListener('pointerdown', down);
      grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerup', up);
      if (tempBand) tempBand.remove();
    };
  }, [hourW, set]);

  /* crosshair: tijd aflezen waar je muis staat */
  useEffect(() => {
    const scr = document.getElementById('scroller')!;
    const grid = document.getElementById('grid')!;
    const mm = (ev: MouseEvent) => {
      const cross = crossRef.current; if (!cross) return;
      const rect = grid.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      if (x < labelW() + 2) { cross.style.display = 'none'; return; }
      const h = START_H + (x - labelW()) / hourW;
      if (h > END_H) { cross.style.display = 'none'; return; }
      cross.style.display = 'block';
      cross.style.left = x + 'px';
      cross.querySelector('.ct')!.textContent = fmt(Math.round(h * 12) / 12) + ' u';
    };
    const ml = () => { const c = crossRef.current; if (c) c.style.display = 'none'; };
    scr.addEventListener('mousemove', mm);
    scr.addEventListener('mouseleave', ml);
    return () => { scr.removeEventListener('mousemove', mm); scr.removeEventListener('mouseleave', ml); };
  }, [hourW]);

  /* nu-lijn: hartslag-hook + eenmalig naar het heden scrollen */
  const isToday = vandaagFeestdag() === state.dag;
  let nowH = nuUur();
  const toonNu = isToday && nowH >= START_H && nowH <= END_H;
  useEffect(() => {
    if (!toonNu) return;
    (window as any)._gfNowFix = (hh: number) => {
      const nl = nowlineRef.current;
      if (nl && nl.isConnected) nl.style.left = xPos(Math.min(Math.max(hh, START_H), END_H)) + 'px';
    };
    const raf = requestAnimationFrame(() => {
      const scroller = document.getElementById('scroller')!;
      scroller.scrollLeft = xPos(nuUur()) - labelW() - 160;
    });
    return () => { delete (window as any)._gfNowFix; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toonNu, hourW, state.dag, dataVersion]);

  /* ---- rijen opbouwen (zelfde selectie & sortering als vanilla) ---- */
  const rowEvsOf = (p: Rij) => dayEvents.filter(e => e.plein === p.id && matchesE(e));
  const winActive = state.van != null && state.tot != null;
  const mainRows = ROWS.filter(r => r.sec !== 'elders')
    .filter(p => !winActive || rowEvsOf(p).length); /* bij actieve selectie: enkel rijen met iets erin */
  const eldersRows = ROWS.filter(r => r.sec === 'elders')
    .map(p => ({ p, evs: rowEvsOf(p) }))
    .filter(x => x.evs.length)
    .sort((a, b) => b.evs.length - a.evs.length
      || Math.max(...b.evs.map(scoreEv)) - Math.max(...a.evs.map(scoreEv)))
    .map(x => x.p);

  const hours = [];
  for (let h = START_H; h <= END_H; h++) hours.push(h);

  const stripCats = stripCatsFor(state.dag);
  let stripPx = 12;

  let eldersHeaderPlaced = false;

  return (
    <>
      <div className="timehead">
        <div className="corner">{DOW[state.dag]} {state.dag} juli</div>
        <div className="hours">
          {hours.map(h => (
            <span key={h} className={'h' + (h === 24 ? ' mid' : '')} style={{ left: ((h - START_H) * hourW) + 'px' }}>
              {h === 24 ? 'middernacht' : (h % 24) + 'u'}
            </span>
          ))}
        </div>
      </div>

      {/* actief tijdsvenster als band in het raster (geclampt: 8u valt vóór de as) */}
      {winActive && (
        <div className="selband" style={{ left: xPos(Math.max(state.van!, START_H)) + 'px', width: ((state.tot! - Math.max(state.van!, START_H)) * hourW) + 'px' }}>
          <span className="sellbl">{fmt(state.van!)} – {fmt(state.tot!)}</span>
          <button className="selx" title="Venster wissen" onClick={() => set({ van: null, tot: null })}>×</button>
        </div>
      )}

      <div className="sectionhead">
        <div className="rowlabel"><span className="naam">Feestpleinen{store.LIVE_ROWS ? ' & drukste locaties' : ''}</span></div>
      </div>

      {[...mainRows, ...eldersRows].map(p => {
        const kop = p.sec === 'elders' && !eldersHeaderPlaced ? (eldersHeaderPlaced = true) : false;
        /* sub-lanes: overlappende events stapelen onder elkaar i.p.v. over elkaar */
        const evs = dayEvents.filter(e => e.plein === p.id).sort((a, b) => a.start - b.start || (b.dur - a.dur));
        const laneEndsPx: number[] = [];
        const blokken = evs.map(e => {
          const durVis = Math.max(.5, Math.min(e.dur, 6, END_H - e.start));
          const pxL = (e.start - START_H) * hourW;
          const pxW = Math.max(durVis * hourW - 4, 46); // min. breedte voor tikbaarheid
          /* lanes op pixelniveau: ook een opgeblazen mini-blok mag niet over zijn opvolger schuiven */
          let li = laneEndsPx.findIndex(end => pxL >= end + 2);
          if (li < 0) { li = laneEndsPx.length; laneEndsPx.push(0); }
          laneEndsPx[li] = pxL + pxW;
          return { e, pxL, pxW, li };
        });
        const rowH = Math.max(54, PAD * 2 + laneEndsPx.length * LANE_H + Math.max(0, laneEndsPx.length - 1) * LANE_GAP);
        const evs2 = p.sec === 'elders' ? rowEvsOf(p) : null;
        return (
          <div key={p.id} style={{ display: 'contents' }}>
            {kop && (
              <div className="sectionhead elders" id="eldersHead">
                <div className="rowlabel"><span className="naam">Elders in de stad</span></div>
              </div>
            )}
            <div className={'row' + (p.sec === 'elders' ? ' eldersrow' : '')}
              data-tmin={evs2 ? Math.min(...evs2.map(e => e.start)) : undefined}
              data-tmax={evs2 ? Math.max(...evs2.map(e => e.start + e.dur)) : undefined}>
              <button className="rowlabel rowlabel-btn" onClick={() => openPanel({ type: 'plein', p })}>
                <span className="naam">{p.naam}</span><span className="tag">{p.tag}</span>
              </button>
              <div className="lane" style={{ minHeight: rowH + 'px' }}>
                <div className="gridlines" />
                {blokken.map(({ e, pxL, pxW, li }) => (
                  <button key={e.id} className={'ev' + (matchesE(e) ? '' : ' dimmed')}
                    style={{
                      '--c': GENRES[e.genre].c, left: pxL + 'px', width: pxW + 'px',
                      top: (PAD + li * (LANE_H + LANE_GAP)) + 'px', height: LANE_H + 'px',
                    } as React.CSSProperties}
                    onClick={() => openPanel({ type: 'event', e, p })}>
                    <span className="bx"><span className="t">{e.titel}</span><span className="m">{fmt(e.start)}{e.gratis ? '' : <> · <span className="paid">€</span></>}</span></span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* ---- doorlopend & elders onderaan, in mineur ---- */}
      <div className="sectionhead">
        <div className="rowlabel"><span className="naam">Doorlopend &amp; elders in de stad</span></div>
      </div>
      <div className="row strip">
        <div className="rowlabel"><span className="naam">Rest van de stad</span><span className="tag">hele dag</span></div>
        <div className="lane">
          {stripCats.map(c => {
            const left = stripPx;
            stripPx += c.cat.length * 7.4 + 74;
            return (
              <button key={c.cat} className="pill" style={{ left: left + 'px' }} onClick={() => openPanel({ type: 'categorie', c })}>
                <b>{c.cat}</b><span className="n">{c.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* crosshair: tijd aflezen waar je muis staat */}
      <div className="crosshair" ref={crossRef}><span className="ct" /></div>

      {toonNu && <div className="nowline" ref={nowlineRef} style={{ left: xPos(Math.min(Math.max(nowH, START_H), END_H)) + 'px' }} />}
    </>
  );
}
