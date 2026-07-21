import { useApp } from '../appContext';
import { DOW, END_H, GENRES, PLEINEN } from '../config';
import { store } from '../data/store';
import { fmt, initialOf, isPast } from '../lib/tijd';
import type { GFEvent } from '../types';

/* ================= ZOEKEN OVER ALLE DAGEN ================= */
export function ZoekView() {
  const { state, openPanel } = useApp();
  const q = state.q;
  const naamVan = (id: string | null) => { const r = (store.LIVE_ROWS || PLEINEN).find(r => r.id === id); return r ? r.naam : ''; };
  if (!q || q.length < 2) {
    return <div className="zres"><p className="zhint">Typ minstens twee letters — er wordt gezocht in het volledige programma, alle dagen en uren.</p></div>;
  }
  const pool = [...(store.EVENTS || []), ...(store.LIVE_REST || [])];
  const hits = pool.filter(e => ((e.titel || '') + ' ' + (e.loc || naamVan(e.plein))).toLowerCase().includes(q))
    .sort((a, b) => a.dag - b.dag || (a.start ?? 99) - (b.start ?? 99));
  if (!hits.length) {
    return <div className="zres"><p className="zhint">Niets gevonden voor “{q}”.</p></div>;
  }
  /* groepeer per dag */
  const groepen: { dag: number; evs: GFEvent[] }[] = [];
  hits.forEach(e => {
    const g = groepen[groepen.length - 1];
    if (!g || g.dag !== e.dag) groepen.push({ dag: e.dag, evs: [e] });
    else g.evs.push(e);
  });
  return (
    <div className="zres">
      <p className="zhint klein">{hits.length} resultaten{store.GF_ALL ? '' : ' · rest van de week wordt nog geladen'}</p>
      {groepen.map(({ dag, evs }) => {
        const dagVoorbij = isPast({ dag, start: END_H, dur: 0 } as GFEvent);
        return (
          <div key={dag} style={{ display: 'contents' }}>
            <h3 className="kh"><span className="knaam">{DOW[dag]} {dag} juli</span>{dagVoorbij && <span className="ktag">voorbij</span>}</h3>
            <div className="egrid zgrid">
              {evs.map(e => {
                const g = GENRES[e.genre] || { c: 'var(--gent-gray-medium)', label: e.cat || 'Doorlopend' };
                const voorbij = isPast(e);
                const plek = e.loc || naamVan(e.plein);
                const tijd = ((e.start != null && e.dur != null) ? `${fmt(e.start)} – ${fmt(e.start + e.dur)}` : (e.start != null ? fmt(e.start) + ' u' : 'doorlopend')) + (voorbij ? ' · voorbij' : '');
                return (
                  <button key={e.id} className={'etile' + (voorbij ? ' past' : '')} style={{ '--c': g.c } as React.CSSProperties}
                    onClick={() => openPanel({ type: 'event', e, p: { naam: plek, tag: '' } })}>
                    <span className="eth2">{initialOf(e)}{e.img && <img src={e.img} alt="" loading="lazy" onError={ev => ev.currentTarget.remove()} />}</span>
                    <span className="ebody">
                      <span className="ti2">{e.titel}</span>
                      <span className="me2"><span className="tr">{tijd}</span>{plek ? <><span className="gd" />{plek}</> : null}{(e.gratis as any) === false || (e.gratis as any) === 0 ? <> · <span className="paid">€</span></> : null}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
