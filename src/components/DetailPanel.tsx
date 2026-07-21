import { useApp } from '../appContext';
import { DESCR, DOW, GENRES } from '../config';
import { store } from '../data/store';
import { sublocNodig } from '../lib/geo';
import { fmt, isPast, nuUur, vandaagFeestdag } from '../lib/tijd';
import type { GFEvent, Rij, StripCat } from '../types';

/* ================= DETAILPANEEL =================
   Vanilla: openPlein/openEvent/openCategory schreven det.innerHTML.
   Hier: één component die rendert wat in ctx.panel staat. */

function PleinInhoud({ p }: { p: Rij }) {
  const { state, matchesE, closePanel } = useApp();
  const evs = store.EVENTS.filter(e => e.dag === state.dag && e.plein === p.id && matchesE(e)).sort((a, b) => a.start - b.start);
  const isTodayS = vandaagFeestdag() === state.dag;
  const hReal = nuUur();
  return (
    <>
      <button className="close" aria-label="Sluiten" onClick={closePanel}>×</button>
      <span className="genrebadge" style={{ '--c': 'var(--gent-cyan)' } as React.CSSProperties}><span className="sw" />{DOW[state.dag]} {state.dag} juli · volledig programma</span>
      <h2>{p.naam}</h2>
      {p.tag && <p style={{ marginTop: -6, color: 'var(--gent-gray-medium)', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.5px' }}>{p.tag}</p>}
      <div className="listing">
        {evs.length ? evs.map(e => {
          const bezig = isTodayS && e.start <= hReal && hReal < e.start + e.dur;
          const voorbij = !bezig && isPast(e);
          return (
            <button key={e.id} onClick={() => (window as any)._gfOpen(e.id)}
              style={{ ...(bezig ? { background: 'var(--gent-green-light)' } : null), ...(voorbij ? { opacity: .5 } : null) }}>
              <span className="tt">{fmt(e.start)}</span>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: GENRES[e.genre].c, alignSelf: 'center', flex: '0 0 auto' }} />
              <span className="nm">{e.titel}</span>
            </button>
          );
        }) : <p style={{ color: 'var(--gent-gray-medium)', fontSize: '.88rem' }}>Geen programma vandaag binnen je huidige filters.</p>}
      </div>
    </>
  );
}

function EventInhoud({ e, p }: { e: GFEvent; p: { id?: string; naam: string; tag?: string } }) {
  const { closePanel } = useApp();
  const g = GENRES[e.genre];
  /* Google-Maps-link: altijd de sublocatie-coords uit de dataset */
  const _geo = (window._GF_LOCGEO && e.loc) ? window._GF_LOCGEO.get((e.loc + '').toLowerCase().trim()) : null;
  const _coord = _geo || (window._GF_KAL_COORDS && p.id ? window._GF_KAL_COORDS[p.id] : null);
  const _gmu = 'https://www.google.com/maps/search/?api=1&query='
    + (_coord ? `${_coord[0]},${_coord[1]}` : encodeURIComponent((e.loc || p.naam || 'Gentse Feesten') + ', Gent, België'));
  const descr = e.descr || DESCR[e.genre](e.titel, p.naam);
  return (
    <>
      <button className="close" aria-label="Sluiten" onClick={closePanel}>×</button>
      <div className="photo" style={{ '--c': g.c } as React.CSSProperties}>
        <span className="ph">{e.titel.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()}<small>{p.naam}</small></span>
        {e.img && <img src={e.img} alt={e.titel} onError={ev => ev.currentTarget.remove()} />}
      </div>
      <span className="genrebadge" style={{ '--c': g.c } as React.CSSProperties}><span className="sw" />{g.label}</span>
      <h2>{e.titel}</h2>
      <div className="meta">
        <span><a className="maplink" href={_gmu} target="_blank" rel="noopener" title="Open in Google Maps">📍 <b>{p.naam}</b>{sublocNodig(e.loc, p.naam) ? ` · ${e.loc}` : ''} ↗</a></span>
        <span>🕘 {DOW[e.dag]} {e.dag} juli · <b>{fmt(e.start)} – {fmt(e.start + e.dur)} u</b></span>
      </div>
      <div className="badges">
        {e.gratis && <span className="badge gratis">gratis</span>}
        {e.kids && <span className="badge">kindvriendelijk</span>}
        {e.demo && <span className="badge" title="Fictief programmapunt ter illustratie">demodata</span>}
      </div>
      <p>{descr}</p>
      <a className="link" href={e.url || ('https://gentsefeesten.stad.gent/nl/day/' + e.dag + '/time')} target="_blank" rel="noopener">
        {e.url ? 'Meer info & tickets' : 'Bekijk op gentsefeesten.stad.gent'}</a>
    </>
  );
}

function CategorieInhoud({ c }: { c: StripCat }) {
  const { state, closePanel } = useApp();
  return (
    <>
      <button className="close" aria-label="Sluiten" onClick={closePanel}>×</button>
      <span className="genrebadge" style={{ '--c': 'var(--gent-cyan)' } as React.CSSProperties}><span className="sw" />Doorlopend · {DOW[state.dag]} {state.dag} juli</span>
      <h2>{c.cat}</h2>
      <p>{c.n} activiteiten in deze categorie lopen vandaag door of hebben meerdere sessies. Een greep (echte programmapunten 2026):</p>
      <div className="listing">
        {c.items.map((i, ix) => (
          <button key={ix}><span className="tt">{i.tt}</span><span className="nm">{i.nm}</span></button>
        ))}
      </div>
      <a className="link" href={`https://gentsefeesten.stad.gent/nl/day/${state.dag}/time`} target="_blank" rel="noopener">Volledige lijst op de officiële site</a>
    </>
  );
}

function DiagnoseInhoud() {
  const { closePanel } = useApp();
  const d = store.diagnose;
  if (!d) return null;
  const pre: React.CSSProperties = { background: 'var(--gent-gray-ultra)', border: '1px solid var(--gent-gray-light)', borderRadius: 'var(--radius-2)', padding: 10, fontSize: '.72rem', overflow: 'auto', whiteSpace: 'pre-wrap' };
  return (
    <>
      <button className="close" aria-label="Sluiten" onClick={closePanel}>×</button>
      <span className="genrebadge" style={{ '--c': 'var(--gent-orange)' } as React.CSSProperties}><span className="sw" />Diagnose live data</span>
      <h2>Records geladen, maar niet gekoppeld</h2>
      <p>{d.recsLength} records opgehaald uit <b>{d.used}</b>. De velddetectie koos deze velden:</p>
      <pre style={pre}>{JSON.stringify(d.keys, null, 1)}</pre>
      <p>Voorbeeld van locatiewaarden: {d.locSamples.length ? d.locSamples.map((l, i) => <i key={i}>{i > 0 && ' · '}{l}</i>) : <b>geen — het locatieveld werd niet gevonden of is leeg</b>}</p>
      <p>Eerste record uit de dataset:</p>
      <pre style={pre}>{JSON.stringify(d.sample, null, 1)}</pre>
      <p>Deel dit paneel en de mapping wordt exact gemaakt.</p>
    </>
  );
}

export function DetailPanel() {
  const { panel, closePanel } = useApp();
  return (
    <div className={'panelwrap' + (panel ? ' open' : '')} id="panelWrap">
      <div className="scrim" id="scrim" onClick={closePanel} />
      <aside className="detail" id="detail" role="dialog" aria-modal="true">
        {panel?.type === 'plein' && <PleinInhoud p={panel.p} />}
        {panel?.type === 'event' && <EventInhoud e={panel.e} p={panel.p} />}
        {panel?.type === 'categorie' && <CategorieInhoud c={panel.c} />}
        {panel?.type === 'diagnose' && <DiagnoseInhoud />}
      </aside>
    </div>
  );
}
