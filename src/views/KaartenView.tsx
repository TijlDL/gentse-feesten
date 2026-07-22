import { useApp } from '../appContext';
import { AfstChip } from '../components/AfstChip';
import { LiveDot } from '../components/LiveDot';
import { GENRES } from '../config';
import { afstandTot, sublocNodig } from '../lib/geo';
import { fmt, initialOf, isPast, nuUur, scoreEv, vandaagFeestdag } from '../lib/tijd';
import type { GFEvent, Rij } from '../types';

/* ============ EXPERIMENT: PROGRAMMA PER LOCATIE (DESKTOP) ============ */

function ETile({ e, p }: { e: GFEvent; p: Rij }) {
  const { state, openPanel } = useApp();
  const isToday = vandaagFeestdag() === state.dag;
  const nowH = nuUur();
  const live = isToday && e.start <= nowH && nowH < e.start + e.dur;
  const voorbij = !live && isPast(e);
  const sub = sublocNodig(e.loc, p.naam);
  return (
    <button className={'etile' + (voorbij ? ' past' : '')} style={{ '--c': GENRES[e.genre].c } as React.CSSProperties}
      onClick={() => openPanel({ type: 'event', e, p })}>
      <span className="eth2">{initialOf(e)}{e.img && <img src={e.img} alt="" loading="lazy" onError={ev => ev.currentTarget.remove()} />}</span>
      <span className="ebody">
        <span className="ti2">{e.titel}</span>
        <span className="me2"><span className={'tr' + (live ? ' on' : '')} title={e.eindeGeschat ? 'einduur geschat' : undefined}>{live && <LiveDot />}{fmt(e.start)} – {e.eindeGeschat ? '±' : ''}{fmt(e.start + e.dur)}</span><span className="gd" />{GENRES[e.genre].label}{e.gratis ? '' : <> · <span className="paid">€</span></>}{voorbij ? ' · voorbij' : ''}</span>
        {sub && <span className="subloc">{e.loc}</span>}
      </span>
    </button>
  );
}

function KSec({ p, evs }: { p: Rij; evs: GFEvent[] }) {
  return (
    <section className="ksec">
      <h3 className="kh"><span className="knaam">{p.naam}</span>{p.tag && <span className="ktag">{p.tag}</span>}<AfstChip row={p} /></h3>
      <div className="egrid">{evs.map(e => <ETile key={e.id} e={e} p={p} />)}</div>
    </section>
  );
}

export function KaartenView({ ROWS, dayEvents }: { ROWS: Rij[]; dayEvents: GFEvent[] }) {
  const { state, matchesE } = useApp();
  const rowEvsOf = (p: Rij) => dayEvents.filter(e => e.plein === p.id && matchesE(e)).sort((a, b) => a.start - b.start);
  const byAfst = (a: { p: Rij }, b: { p: Rij }) => {
    const da = afstandTot(a.p, state.geo, state.dag), db = afstandTot(b.p, state.geo, state.dag);
    if (da == null && db == null) return 0; if (da == null) return 1; if (db == null) return -1; return da - db;
  };
  let main = ROWS.filter(r => r.sec !== 'elders').map(p => ({ p, evs: rowEvsOf(p) })).filter(x => x.evs.length);
  if (state.geo) main = main.slice().sort(byAfst);
  const eld = ROWS.filter(r => r.sec === 'elders').map(p => ({ p, evs: rowEvsOf(p) })).filter(x => x.evs.length)
    .sort((a, b) => state.geo ? byAfst(a, b)
      : (b.evs.length - a.evs.length
        || Math.max(...b.evs.map(scoreEv)) - Math.max(...a.evs.map(scoreEv))));
  if (!main.length && !eld.length)
    return <div className="kview2"><p className="stil" style={{ marginTop: 20 }}>Niets gevonden voor deze dag binnen je filters.</p></div>;
  return (
    <div className="kview2">
      {main.map(({ p, evs }) => <KSec key={p.id} p={p} evs={evs} />)}
      {eld.length > 0 && <p className="msec">Elders in de stad</p>}
      {eld.map(({ p, evs }) => <KSec key={p.id} p={p} evs={evs} />)}
    </div>
  );
}
