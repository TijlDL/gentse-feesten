import { useState } from 'react';
import { useApp } from '../appContext';
import { AfstChip } from '../components/AfstChip';
import { LiveDot } from '../components/LiveDot';
import { Ruler } from '../components/Ruler';
import { GENRES } from '../config';
import { afstandTot } from '../lib/geo';
import { sublocNodig } from '../lib/geo';
import { stripCatsFor } from '../lib/strip';
import { fmt, initialOf, isPast, nuUur, scoreEv, vandaagFeestdag } from '../lib/tijd';
import type { GFEvent, Rij } from '../types';

/* ================= MOBIELE WEERGAVE: nu & straks ================= */

function LRow({ e, p, running }: { e: GFEvent; p: Rij | null; running: boolean }) {
  const { openPanel } = useApp();
  const voorbij = !running && isPast(e);
  const sub = p && sublocNodig(e.loc, p.naam);
  return (
    <button className={'lrow' + (voorbij ? ' past' : '')} style={{ '--c': GENRES[e.genre].c } as React.CSSProperties}
      onClick={() => openPanel({ type: 'event', e, p: p ?? { naam: e.loc || '' } })}>
      <span className="th">{initialOf(e)}{e.img && <img src={e.img} alt="" loading="lazy" onError={ev => ev.currentTarget.remove()} />}</span>
      <span className="bx">
        <span className="ti">{e.titel}</span>
        {/* geen genre-kleurblokje in de mobiele kaarten: het genre in tekst volstaat */}
        <span className="me"><span className={'tr' + (running ? ' on' : '')} title={e.eindeGeschat ? 'einduur geschat' : undefined}>{running && <LiveDot />}{fmt(e.start)} – {e.eindeGeschat ? '±' : ''}{fmt(e.start + e.dur)}</span><span aria-hidden="true">·</span>{GENRES[e.genre].label}{voorbij ? ' · voorbij' : ''}</span>
        {sub && <span className="subloc">{e.loc}</span>}
      </span>
    </button>
  );
}

function PCard({ p, children }: { p: Rij; children: React.ReactNode }) {
  const { openPanel } = useApp();
  return (
    <section className="pcard">
      <button className="phead" onClick={() => openPanel({ type: 'plein', p })}>
        <h3>{p.naam}</h3><span className="tag2">{p.tag || ''}</span><AfstChip row={p} /><span className="chev">›</span>
      </button>
      {children}
    </section>
  );
}

function MobCats() {
  const { state, openPanel } = useApp();
  const cats = stripCatsFor(state.dag);
  if (!cats.length) return null;
  return (
    <div className="mobcats">
      {cats.map(c => (
        <button key={c.cat} className="pill2" onClick={() => openPanel({ type: 'categorie', c })}>
          {c.cat}<span className="n">{c.n}</span>
        </button>
      ))}
    </div>
  );
}

export function MobielView({ ROWS, dayEvents, stickyEl }: { ROWS: Rij[]; dayEvents: GFEvent[]; stickyEl: HTMLElement | null }) {
  const { state, matchesE, filterSig, tijdRef, openPanel } = useApp();
  const [t5, setT5] = useState<number | null>(null);
  const isTodayR = vandaagFeestdag() === state.dag;
  const nowRH = nuUur();
  const reallyLive = (e: GFEvent) => isTodayR && e.start <= nowRH && nowRH < e.start + e.dur;

  const winActive = state.van != null || state.tot != null || state.pleinen.size > 0;
  if (winActive) {
    /* venster/plein-modus: geen liniaal; volledig dagprogramma per locatie */
    const entries: { p: Rij; evs: GFEvent[] }[] = [];
    ROWS.forEach(p => {
      const evs = dayEvents.filter(e => e.plein === p.id && matchesE(e)).sort((a, b) => a.start - b.start);
      if (evs.length) entries.push({ p, evs });
    });
    const mainE = entries.filter(x => x.p.sec !== 'elders').sort((a, b) =>
      state.geo ? ((afstandTot(a.p, state.geo, state.dag) ?? 9e9) - (afstandTot(b.p, state.geo, state.dag) ?? 9e9)) : (a.evs[0].start - b.evs[0].start));
    const eldE = entries.filter(x => x.p.sec === 'elders')
      .sort((a, b) => b.evs.length - a.evs.length || Math.max(...b.evs.map(scoreEv)) - Math.max(...a.evs.map(scoreEv)));
    let msecP = false;
    return (
      <div className="mob">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...mainE, ...eldE].map(({ p, evs }) => {
            const kop = p.sec === 'elders' && !msecP ? (msecP = true) : false;
            return (
              <div key={p.id} style={{ display: 'contents' }}>
                {kop && <p className="msec">Elders in de stad</p>}
                <PCard p={p}>
                  {evs.map(e => <LRow key={e.id} e={e} p={p} running={isTodayR && e.start <= nowRH && nowRH < e.start + e.dur} />)}
                </PCard>
              </div>
            );
          })}
          {!entries.length && <p className="stil">Niets gevonden binnen dit tijdsvenster.</p>}
        </div>
      </div>
    );
  }

  /* liniaal-modus: lijst volgt de gescrubde tijd t5 */
  const t = t5 ?? 20;
  const stil: Rij[] = [];
  const entries: { p: Rij; live: GFEvent[]; next: GFEvent | undefined }[] = [];
  ROWS.forEach(p => {
    const evs = dayEvents.filter(e => e.plein === p.id && matchesE(e)).sort((a, b) => a.start - b.start);
    if (!evs.length) return;
    const live = evs.filter(e => e.start <= t && t < e.start + e.dur);
    const next = evs.find(e => e.start > t);
    if (!live.length && !next) { if (p.sec !== 'elders') stil.push(p); return; } /* dagprogramma zit erop */
    entries.push({ p, live, next });
  });
  type Entry = typeof entries[number];
  /* sortering: "waar is nu iets bezig" wint altijd — mét geolocatie komt
     daarbinnen het dichtstbijzijnde eerst (pleinen waar niets bezig is,
     zakken dus onder de levende, ook al liggen ze dichterbij); zonder
     geolocatie beslist de starttijd */
  const relSort = (a: Entry, b: Entry) => state.geo
    ? (((a.live.length ? 0 : 1) - (b.live.length ? 0 : 1))
      || ((afstandTot(a.p, state.geo, state.dag) ?? 9e9) - (afstandTot(b.p, state.geo, state.dag) ?? 9e9))
      || ((a.live[0]?.start ?? a.next?.start ?? 99) - (b.live[0]?.start ?? b.next?.start ?? 99)))
    : (((a.live.length ? 0 : 1) - (b.live.length ? 0 : 1))
      || ((a.live[0]?.start ?? a.next?.start ?? 99) - (b.live[0]?.start ?? b.next?.start ?? 99)));
  const funScore = (x: Entry) => x.live.length * 100 + Math.max(0, ...x.live.map(scoreEv), ...(x.next ? [scoreEv(x.next)] : [0]));
  const mainE = entries.filter(x => x.p.sec !== 'elders').sort(relSort);
  const eldE = entries.filter(x => x.p.sec === 'elders').sort((a, b) => funScore(b) - funScore(a) || relSort(a, b));
  let msecPlaced = false;
  return (
    <>
      <Ruler dayEvents={dayEvents} dag={state.dag} matchesE={matchesE} tijdRef={tijdRef}
        onTime={setT5} filterSig={filterSig} portalNaar={stickyEl} />
      <div className="mob">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {t5 != null && [...mainE, ...eldE].map(({ p, live, next }) => {
            const kop = p.sec === 'elders' && !msecPlaced ? (msecPlaced = true) : false;
            return (
              <div key={p.id} style={{ display: 'contents' }}>
                {kop && <p className="msec">Elders in de stad</p>}
                <PCard p={p}>
                  {live.map(e => <LRow key={e.id} e={e} p={p} running={reallyLive(e)} />)}
                  {next && <LRow e={next} p={p} running={reallyLive(next)} />}
                  <button className="pmore" onClick={() => openPanel({ type: 'plein', p })}>Volledig programma ›</button>
                </PCard>
              </div>
            );
          })}
          {t5 != null && stil.length > 0 && (
            <div className="stilchips">
              <span className="lbl">Vandaag niets meer op:</span>
              {stil.map(p => (
                <button key={p.id} className="pill2" onClick={() => openPanel({ type: 'plein', p })}>{p.naam}</button>
              ))}
            </div>
          )}
          {t5 != null && <MobCats />}
        </div>
      </div>
    </>
  );
}
