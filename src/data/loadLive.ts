/* ================= LIVE DATA (open data Stad Gent) =================
   Vrijwel letterlijke poort van de vanilla-pijplijn. Bewust niet
   "vereenvoudigd": de dubbele velddetectie (exact schema + heuristiek),
   de endMode-sanity-check en de 3-signalen-pleinkoppeling zijn
   ontwerpkeuzes (zie CLAUDE.md). TS is hier pragmatisch (veel `any`):
   de heuristiek scant per definitie onbekende schema's. */
import { DAYS, GENRES, PLEINEN } from '../config';
import { fmt } from '../lib/tijd';
import { BUILD_ID, cacheGeldig, cacheLees, cacheZet, dagKeyNu } from './cache';
import { store, notify, setStatus } from './store';

/** @param force true (Vernieuwen-knop): cache overslaan en écht opnieuw ophalen */
export async function loadLive(force = false): Promise<void> {
  store.loading = true; store.loadError = null; notify();
  const ids = ['gentse-feesten-evenementen-2026', 'gentse-feesten-evenementen-2025'];
  const parseTime = (v: any) => { if (v == null) return null; const m = String(v).match(/(\d{1,2})\s*[:.uh]\s*(\d{2})/); return m ? (+m[1]) + (+m[2]) / 60 : null; };
  try {
    /* ---- 1. ophalen ---- */
    const setMsg = (t: string) => setStatus(t);
    /* gepagineerd met parallelle batches: snelste pad (API serveert uit cache) */
    const fetchPaged = async (id: string, label: string | null, where: string | null) => {
      const base = `https://data.stad.gent/api/explore/v2.1/catalog/datasets/${id}/records`;
      const wh = where ? `&where=${encodeURIComponent(where)}` : '';
      /* stabiele volgorde is cruciaal bij parallelle paginering */
      let ord = '&order_by=startdate';
      let probe = await fetch(`${base}?limit=1${ord}${wh}`);
      if (!probe.ok) { ord = ''; probe = await fetch(`${base}?limit=1${wh}`); }
      if (!probe.ok) return null;
      const total = Math.min((await probe.json()).total_count || 0, 9900);
      if (!total) return [];
      const offs: number[] = []; for (let o = 0; o < total; o += 100) offs.push(o);
      const out: any[][] = new Array(offs.length); let done = 0;
      const CH = 8; /* 8 requests tegelijk */
      for (let i = 0; i < offs.length; i += CH) {
        await Promise.all(offs.slice(i, i + CH).map(async (off, ix) => {
          const r = await fetch(`${base}?limit=100&offset=${off}${ord}${wh}`);
          out[i + ix] = r.ok ? ((await r.json()).results || []) : [];
          done++;
          if (label) setMsg(`${label} ${Math.min(99, Math.round(Math.min(done * 100, total) / total * 100))}%`);
        }));
      }
      return out.flat();
    };
    const fetchDS = (id: string, label: string | null, where?: string | null) => { if (label) setMsg(label + '…'); return fetchPaged(id, label, where ?? null); };
    /* feestdag-venster: 07u lokaal t/m 07u volgende dag = 05:00Z t/m 05:00Z (juli, UTC+2) */
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const whereDag = (d: number) => `startdate>=date'2026-07-${pad2(d)}T05:00:00Z' and startdate<date'2026-07-${pad2(d + 1)}T05:00:00Z'`;
    const nu = new Date();
    const feestVandaag = (nu.getMonth() === 6 && DAYS.includes(nu.getHours() < 7 ? nu.getDate() - 1 : nu.getDate()))
      ? (nu.getHours() < 7 ? nu.getDate() - 1 : nu.getDate()) : DAYS[0];
    /* dagcache: dezelfde build + dezelfde feestdag → geen netwerk nodig */
    let used = ids[0];
    let recs: any[] | null = null, locRecs: any[] | null = null, thRecs: any[] | null = null;
    let progressief = true, uitCache = false;
    if (!force) {
      const c = await cacheLees();
      if (cacheGeldig(c)) {
        ({ recs, locRecs, thRecs, used } = c);
        uitCache = true; progressief = false; /* cache = volledige dataset → meteen finaal */
      }
    }
    /* fase A: vandaag + de (kleine) join-datasets parallel */
    if (!uitCache) [recs, locRecs, thRecs] = await Promise.all([
      fetchDS(used, 'vandaag laden', whereDag(feestVandaag)),
      fetchDS(used.replace('evenementen', 'locaties'), null).catch(() => null),
      fetchDS(used.replace('evenementen', 'themas'), null).catch(() => null),
    ]);
    if (!uitCache && (!recs || !recs.length)) {
      /* dagfilter niet ondersteund of leeg: terugvallen op volledige lading (oude pad) */
      progressief = false;
      [recs, locRecs, thRecs] = await Promise.all([
        fetchDS(used, 'programma laden'),
        fetchDS(used.replace('evenementen', 'locaties'), null).catch(() => null),
        fetchDS(used.replace('evenementen', 'themas'), null).catch(() => null),
      ]);
      if (!recs || !recs.length) {
        used = ids[1];
        [recs, locRecs, thRecs] = await Promise.all([
          fetchDS(used, 'programma laden'),
          fetchDS(used.replace('evenementen', 'locaties'), null).catch(() => null),
          fetchDS(used.replace('evenementen', 'themas'), null).catch(() => null),
        ]);
      }
    }
    if (!recs) throw { msg: 'dataset niet gevonden op data.stad.gent' };
    if (!recs.length) throw { msg: `dataset ${used} is leeg` };

    const verwerk = (recsIn: any[], finaal: boolean, dagen: number[] | null) => {
      /* dedupe: parallelle paginering op een niet-uniek sorteerveld kan records dupliceren */
      let audDuplicaten = 0;
      const _seen = new Set<string>();
      const recs = recsIn.filter(r => { const k = JSON.stringify(r); if (_seen.has(k)) { audDuplicaten++; return false; } _seen.add(k); return true; });
      /* gejoinde datasets: locaties & thema's — evenementen verwijzen ernaar via API-url */
      const val = (v: any): any => {
        if (v == null) return null;
        if (typeof v === 'string' && /^\s*\{/.test(v)) { try { v = JSON.parse(v); } catch (_) { return v; } }
        if (typeof v === 'object') return v.nl ?? v.naam ?? v.name ?? v.titel ?? v.title ?? v.label ?? v.url ?? null;
        return v;
      };
      const buildMap = (recsIn: any[] | null) => {
        const map = new Map<string, any>();
        if (!recsIn || !recsIn.length) return map;
        const lk = Object.keys(recsIn[0]);
        const nameK = lk.find(k => /(^|_)name_nl$|(^|_)naam/.test(k.toLowerCase()))
          || lk.find(k => /naam|name|titel|title/.test(k.toLowerCase()) && typeof val(recsIn[0][k]) === 'string') || lk[0];
        recsIn.forEach(lr => {
          const nm = val(lr[nameK]); if (!nm) return;
          lk.forEach(k => { const v = lr[k]; if (v != null && typeof v !== 'object' && (v + '').length < 200) map.set((v + '').toLowerCase().trim(), nm); });
        });
        return map;
      };
      let LOCMAP = new Map<string, any>(), THEMEMAP = new Map<string, any>(); const LOCGEO = new Map<string, [number, number]>();
      const geoOf = (lr: any): [number, number] | null => {
        for (const v of Object.values(lr) as any[]) {
          if (v && typeof v === 'object') {
            const la = v.lat ?? v.latitude, lo = v.lon ?? v.lng ?? v.longitude;
            if (typeof la === 'number' && typeof lo === 'number' && la > 50 && la < 52 && lo > 3 && lo < 4.5) return [la, lo];
          }
          if (typeof v === 'string') { const m = v.match(/(5[01]\.\d{3,})[,;\s]+(3\.\d{3,})/); if (m) return [+m[1], +m[2]]; }
        }
        return null;
      };
      try {
        LOCMAP = buildMap(locRecs);
        if (locRecs) locRecs.forEach((lr: any) => {
          const g = geoOf(lr); if (!g) return;
          const lk = Object.keys(lr);
          const nameK = lk.find(k => /(^|_)name_nl$|(^|_)naam/.test(k.toLowerCase()))
            || lk.find(k => /naam|name|titel|title/.test(k.toLowerCase()));
          const nm = nameK ? val(lr[nameK]) : null; if (nm) LOCGEO.set((nm + '').toLowerCase().trim(), g);
        });
      } catch (_) {/* optioneel */ }
      try { THEMEMAP = buildMap(thRecs); } catch (_) {/* optioneel */ }
      const resolveVia = (map: Map<string, any>, raw: any) => {
        const s = ((raw ?? '') + '').toLowerCase().trim();
        if (!s) return '';
        return map.get(s) || map.get(s.split('/').filter(Boolean).pop() || '') || raw;
      };
      const resolveLoc = (raw: any) => { const r = resolveVia(LOCMAP, raw); return (val(r) ?? r ?? '') + ''; };

      /* ---- 2. velddetectie: exact schema (Gentse Feesten event-API 2026) eerst, heuristiek als vangnet ---- */
      const scan = recs.slice(0, 100);
      const K = Object.keys(scan[0] || {});
      const prefer = (...ns: string[]) => ns.find(n => K.includes(n));
      const keysWithValue = (pred: (k: string, v: any) => any) => {
        const hits: Record<string, number> = {};
        scan.forEach(r => Object.entries(r).forEach(([k, v]) => { if (v != null && pred(k.toLowerCase(), v)) hits[k] = (hits[k] || 0) + 1; }));
        return Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([k]) => k);
      };
      const isoKeys = keysWithValue((k, v) => typeof v === 'string' && /^20\d\d-\d\d-\d\dT\d\d:/.test(v));
      const endish = (k: string) => /eind|stop|end(_|$|date|datum|time|tijd)|_end($|_)/.test(k.toLowerCase());
      const isoStartKey = prefer('startdate', 'start_date')
        || isoKeys.find(k => /start|begin|van|datum|date/.test(k.toLowerCase()) && !endish(k))
        || isoKeys.find(k => !endish(k));
      const isoEndKey = prefer('enddate', 'end_date')
        || isoKeys.find(k => k !== isoStartKey && endish(k));
      const exactIso = !!(prefer('startdate', 'start_date') && prefer('enddate', 'end_date'));
      const dateKey = keysWithValue((k, v) => typeof v === 'string' && /^20\d\d-\d\d-\d\d$/.test(v))[0];
      const dagKey = keysWithValue((k, v) => /(^|_)(dag|day)/.test(k) && +v >= 17 && +v <= 26)[0];
      const startKey = keysWithValue((k, v) => k !== isoStartKey && k !== isoEndKey && /start|begin|van/.test(k) && parseTime(v) != null)[0];
      const endKey = keysWithValue((k, v) => k !== isoStartKey && k !== isoEndKey && endish(k) && parseTime(v) != null)[0];
      const titleKey = prefer('name_nl') || keysWithValue((k, v) => /titel|title|naam|name|artiest|event/.test(k) && typeof v === 'string')[0];
      const locKey = prefer('location', 'locatie') || keysWithValue((k, v) => /locatie|location|plein|venue|waar/.test(k) && typeof v === 'string')[0];
      const genreKey = prefer('music_genre') || keysWithValue((k, v) => /genre|categorie|category|discipline/.test(k) && typeof v === 'string')[0];
      const kwKey = prefer('keywords');
      const themeKey = prefer('theme', 'thema');
      const ageKey = prefer('typicalagerange');
      const imgKey = prefer('image_thumbnail', 'image') || keysWithValue((k, v) => /foto|image|afbeelding|img/.test(k) && /^http/.test(String(typeof v === 'object' ? (v.url || '') : v)))[0];
      const descrKey = prefer('description_nl') || keysWithValue((k, v) => /beschrijving|omschrijving|description/.test(k) && typeof v === 'string' && v.length > 40)[0];
      const gratisKey = prefer('isaccessibleforfree') || keysWithValue((k, _v) => /gratis|free/.test(k))[0];
      const urlKey = prefer('url');

      if (!titleKey || !(isoStartKey || ((dateKey || dagKey) && startKey)))
        throw { msg: `${recs.length} records geladen, maar titel/tijd-velden niet herkend — velden: ${K.join(', ')}`, dump: scan[0] };

      /* eindveld-strategie: bij exact herkend schema vertrouwen we start/einde per sessie;
         anders sanity-check op de mediaan (reeks-eindes zijn onbruikbaar) */
      const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      let endMode: 'none' | 'iso' | 'time' = 'none';
      if (exactIso) endMode = 'iso';
      if (endMode === 'none' && isoEndKey && isoStartKey) {
        const ds = scan.map(r => {
          const a = r[isoStartKey] ? new Date(r[isoStartKey]) : null, b = r[isoEndKey] ? new Date(r[isoEndKey]) : null;
          return a && b && !isNaN(+a) && !isNaN(+b) ? (+b - +a) / 3.6e6 : null;
        }).filter((v): v is number => v != null && v > 0);
        if (ds.length >= 5 && median(ds) <= 6) endMode = 'iso';
      }
      if (endMode === 'none' && endKey) {
        const ds = scan.map(r => {
          const t0 = parseTime((startKey && r[startKey]) ?? (isoStartKey && r[isoStartKey]));
          let t1 = parseTime(r[endKey]); if (t0 == null || t1 == null) return null;
          let dd = t1 - t0; if (dd <= 0) dd += 24; return dd;
        }).filter((v): v is number => v != null);
        if (ds.length >= 5 && median(ds) <= 6) endMode = 'time';
      }

      const parseStart = (() => {
        let useIso = !!isoStartKey;
        if (useIso && (dateKey || dagKey) && startKey) {
          const daysIso = new Set(scan.map(r => { const v = r[isoStartKey!]; const dd = v ? new Date(v) : null; return dd && !isNaN(+dd) ? dd.getDate() : null; }).filter(v => v != null));
          const daysAlt = new Set(scan.map(r => dateKey ? ((r[dateKey] || '') + '').slice(8, 10) : r[dagKey]).filter(Boolean));
          if (daysIso.size < 3 && daysAlt.size > daysIso.size) useIso = false; // ISO-veld is vermoedelijk reeks-start
        }
        return (r: any): Date | null => {
          if (useIso && r[isoStartKey!]) { const d = new Date(r[isoStartKey!]); if (!isNaN(+d)) return d; }
          const t = parseTime(startKey && r[startKey]);
          if (t == null) return null;
          if (dateKey && r[dateKey]) { const d = new Date(r[dateKey] + 'T00:00:00'); if (!isNaN(+d)) { d.setHours(Math.floor(t), Math.round(t % 1 * 60)); return d; } }
          if (dagKey && r[dagKey]) return new Date(2026, 6, +r[dagKey], Math.floor(t), Math.round(t % 1 * 60));
          return null;
        };
      })();

      /* ---- 3. records -> events ---- */
      const PLEIN_COORDS: Record<string, [number, number]> = { // vaste ankers voor de gekende pleinen (dataset-coords krijgen voorrang)
        sintjacobs: [51.0561, 3.7290], vlasmarkt: [51.0553, 3.7286], polepole: [51.0551, 3.7205],
        baudelo: [51.0587, 3.7300], boomtown: [51.0503, 3.7250], korenmarkt: [51.0546, 3.7215],
        vrijdagmarkt: [51.0570, 3.7267], sintbaafs: [51.0533, 3.7261], veerle: [51.0576, 3.7208],
        groenten: [51.0556, 3.7228], beesten: [51.0532, 3.7320],
        miramiro: [51.0596, 3.7331], braun: [51.0538, 3.7238], kouter: [51.0501, 3.7255],
        laurent: [51.0484, 3.7292],
      };
      /* zones voor de groeperingsanalyse: grote/langgerekte plekken krijgen
         meerdere ankerpunten en een eigen straal; afstand = tot het dichtstbijzijnde punt */
      /* punt-in-polygoon (ray casting) voor plekken waar een cirkel tekortschiet */
      const inPoly = (pt: [number, number], poly: [number, number][]) => {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [yi, xi] = poly[i], [yj, xj] = poly[j];
          if (((xi > pt[1]) !== (xj > pt[1])) && (pt[0] < (yj - yi) * (pt[1] - xi) / (xj - xi) + yi)) c = !c;
        } return c;
      };
      const PLEIN_ZONES: Record<string, { poly?: [number, number][]; pts?: [number, number][]; r?: number }> = {
        /* vlak: heel het Baudelohof, polygoon getraceerd op de parkcontour */
        baudelo: {
          poly: [[51.0598, 3.7288], [51.0592, 3.7306], [51.0584, 3.7312], [51.0577, 3.7307],
          [51.0576, 3.7295], [51.0580, 3.7281], [51.0589, 3.7273]],
          pts: [[51.0592, 3.7281], [51.0587, 3.7292], [51.0582, 3.7300], [51.0589, 3.7305]], r: 95
        },
        /* blok rondom de Sint-Jacobskerk: locaties liggen aan alle zijden van de kerk */
        sintjacobs: { pts: [[51.0566, 3.7285], [51.0561, 3.7292], [51.0557, 3.7287], [51.0562, 3.7280]], r: 80 },
        /* lijn: beide oevers van het water — Graslei én Korenlei */
        polepole: { pts: [[51.0556, 3.7196], [51.0551, 3.7205], [51.0549, 3.7208], [51.0549, 3.7197], [51.0554, 3.7190]], r: 70 },
        /* lijn: gedempte gracht, 150m lang */
        laurent: { pts: [[51.0489, 3.7289], [51.0484, 3.7292], [51.0479, 3.7295]], r: 70 },
        /* verspreid festivalterrein rond de Sint-Baafsabdij */
        miramiro: { pts: [[51.0600, 3.7325], [51.0592, 3.7338]], r: 110 },
        /* langgerekt plein, lengteas oost-west; Boomtown deelt het plein en blijft compact */
        kouter: { pts: [[51.0500, 3.7246], [51.0501, 3.7255], [51.0502, 3.7263]], r: 85 },
        boomtown: { r: 70 },
        /* groot vierkant plein */
        vrijdagmarkt: { r: 90 },
        /* kleine pleintjes met vaste buren vlakbij: strakke straal zodat ze niet naar elkaar lekken */
        vlasmarkt: { r: 60 }, beesten: { r: 60 }, groenten: { r: 60 },
      };
      const DEFAULT_R = 75;
      const zoneVan = (id: string) => {
        const z = PLEIN_ZONES[id] || {};
        const hand = z.pts || (PLEIN_COORDS[id] ? [PLEIN_COORDS[id]] : []);
        const kal = (KAL[id] && KAL[id].pts) || [];
        return { pts: [...hand, ...kal], r: z.r || DEFAULT_R, poly: z.poly || null };
      };
      const distZ = (a: [number, number], b: [number, number]) => {
        const R = 111320;
        const dy = (a[0] - b[0]) * R, dx = (a[1] - b[1]) * R * Math.cos(a[0] * Math.PI / 180);
        return Math.hypot(dx, dy);
      };
      const PLEIN_MATCH: [string, string[]][] = [
        ['sintjacobs', ['walter de buck', 'sint-jacobs', 'sint jacobs', 'bij sint', 'feestzone']],
        ['vlasmarkt', ['vlasmarkt']], ['beesten', ['beestenmarkt']],
        ['polepole', ['polé', 'pole pole', 'pole-pole', 'graslei']],
        /* Baudelohof-podia: Het Bal, Salsabar en De Karavaan staan in het park (geverifieerd op coords) */
        ['baudelo', ['baudelo', 'bord de l', 'het bal', 'salsabar', 'karavaan']],
        /* Boomtown speelt op de Kouter én binnen in de Handelsbeurs (Ha Concerts / 'Concertzaal') */
        ['boomtown', ['boomtown', 'ha concerts', 'handelsbeurs', 'concertzaal']],
        ['korenmarkt', ['korenmarkt', 'oud postgebouw']],
        ['groenten', ['groentenmarkt', 'galgenhuis']],
        ['vrijdagmarkt', ['vrijdagmarkt', 'lakenmetershuis', 'lakenmeestershuis', 'ons huis']],
        ['sintbaafs', ['baafsplein', 'sint bavo', 'baafskathedraal']],
        /* het Gravensteen en de Oude Vismijn flankeren het Sint-Veerleplein */
        ['veerle', ['veerleplein', 'gravensteen', 'oude vismijn']],
        ['laurent', ['laurentplein', 'luisterplein']],
        ['miramiro', ['miramiro', 'zonder naampark', 'zonder-naampark']],
        /* de Stadshal, het Goudenleeuwplein en de Belfort-trappen vormen één zone rond het Braunplein */
        ['braun', ['braunplein', 'goudenleeuwplein', 'stadshal', 'belfort', 'belfry']],
        ['kouter', ['kouter']],
      ];
      /* 'nabij X' is geen 'op X': verzwakkende woorden maken een naam-match voorwaardelijk */
      const ZWAK = /(nabij|vlak ?bij|dicht ?bij|tegenover|omgeving|in de buurt|richting|aan de rand)/i;
      const _norm = (x: any) => (x + '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const _stam = (t: string) => t.replace(/(markt|plein|park|hof|straat|kaai|lei)$/, '') || t;
      const _tok = (x: any) => _norm(x).split(' ').filter(w => w && !['de', 'het', 't', 'den', 'van', 'der'].includes(w)).map(_stam);
      const eigenWoorden = (pid: string) => {
        const pl = PLEINEN.find(x => x.id === pid);
        const m = PLEIN_MATCH.find(([id]) => id === pid);
        return new Set([..._tok(pl ? pl.naam : ''), ...(m ? m[1].flatMap(w => _tok(w)) : [])]);
      };
      const isIdentiteit = (loc: string, pid: string) => {
        const ew = eigenWoorden(pid);
        return !ZWAK.test(loc) && _tok(loc).every(w => ew.has(w));
      };
      /* ===== ZELFKALIBRATIE: pleinankers uit de dataset zelf =====
         identiteitslocaties (naam = puur het plein) met geloofwaardige coords
         -> mediaan wordt het anker, alle punten versterken de zone.
         De hardgecodeerde ankers zijn enkel nog vertrekpunt/vangnet. */
      const KAL: Record<string, { anker: [number, number]; pts: [number, number][] }> = {};
      {
        const centrum: [number, number] = [51.0545, 3.7250];
        const perPlein: Record<string, [number, number][]> = {};
        LOCGEO.forEach((g, naam) => {
          const R = 111320, dy = (g[0] - centrum[0]) * R, dx = (g[1] - centrum[1]) * R * Math.cos(51.05 * Math.PI / 180);
          if (Math.hypot(dx, dy) > 3000) return; /* ongeloofwaardig ver */
          const hit = PLEIN_MATCH.find(([, ws]) => ws.some(w => naam.includes(w)));
          if (!hit || !isIdentiteit(naam, hit[0])) return;
          (perPlein[hit[0]] ||= []).push(g);
        });
        const med = (a: number[]) => { const x = a.slice().sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
        Object.entries(perPlein).forEach(([pid, punten]) => {
          let m: [number, number] = [med(punten.map(p => p[0])), med(punten.map(p => p[1]))];
          const R = 111320;
          const houd = punten.filter(p => Math.hypot((p[0] - m[0]) * R, (p[1] - m[1]) * R * .63) <= 400);
          if (!houd.length) return;
          m = [med(houd.map(p => p[0])), med(houd.map(p => p[1]))];
          KAL[pid] = { anker: m, pts: houd };
        });
        window.GF_KALIBRATIE = KAL;
      }
      const binnenZone = (g: [number, number] | null, id: string) => {
        if (!g) return false; const z = zoneVan(id);
        if (z.poly && inPoly(g, z.poly)) return true;
        return z.pts.length ? Math.min(...z.pts.map(pt => distZ(g, pt))) <= z.r : false;
      };
      const COORDS_EFF = { ...PLEIN_COORDS };
      Object.entries(KAL).forEach(([pid, k]) => { COORDS_EFF[pid] = k.anker; });
      /* invariant: getoonde posities komen ALTIJD uit de dataset.
         Hand-coords (PLEIN_COORDS) doen enkel nog classificatie (zones). */
      const KAL_COORDS: Record<string, [number, number]> = {};
      Object.entries(KAL).forEach(([pid, k]) => { KAL_COORDS[pid] = k.anker; });
      window._GF_PLEIN_COORDS = COORDS_EFF; window._GF_KAL_COORDS = KAL_COORDS; window._GF_LOCGEO = LOCGEO;
      const all: any[] = [], rest: any[] = [];
      let audZonderDatum = 0, audBuitenDagen = 0;
      recs.forEach((r, i) => {
        const titel = (val(r[titleKey]) || 'Zonder titel') + '';
        const d = parseStart(r);
        if (!d || isNaN(+d)) { audZonderDatum++; return; }
        let dag = d.getDate(), h = d.getHours() + d.getMinutes() / 60;
        if (h < 7) { dag -= 1; h += 24; }
        if (!DAYS.includes(dag)) { audBuitenDagen++; return; }
        /* rawDur = alleen als een vertrouwd eindveld iets zinnigs oplevert, anders null */
        let rawDur: number | null = null;
        if (endMode === 'iso' && r[isoEndKey!] && !/:59:59/.test(String(r[isoEndKey!]))) {
          /* :59:59-eindes zijn placeholders ("tot einde feestnacht"), geen echte
             eindtijd — negeren, zodat de duur-heuristiek het overneemt */
          const de = new Date(r[isoEndKey!]);
          if (!isNaN(+de)) { rawDur = (+de - +d) / 3.6e6; if (rawDur <= 0) rawDur += 24; }
        } else if (endMode === 'time') {
          const te = parseTime(r[endKey]);
          if (te != null) { rawDur = te - (h % 24); if (rawDur <= 0) rawDur += 24; }
        }
        if (rawDur != null && !(rawDur > 0 && rawDur < 24)) rawDur = null;
        let loc = resolveLoc(locKey && r[locKey]);
        if ((!locKey || !loc) && LOCMAP.size) { // geen locatieveld? zoek een veld dat via de locaties-dataset resolvet
          for (const v of Object.values(r)) { const nm = LOCMAP.get(((val(v) || '') + '').toLowerCase().trim()); if (nm) { loc = (val(nm) ?? nm) + ''; break; } }
        }
        const themeName = themeKey ? (val(resolveVia(THEMEMAP, r[themeKey])) || '') + '' : '';
        const kw = ((val(kwKey && r[kwKey]) || '') + '').toLowerCase();
        const genreRaw = [val(genreKey && r[genreKey]), themeName, kw].filter(Boolean).join(' ').toLowerCase();
        const genre = Object.keys(GENRES).find(g => genreRaw.includes(g))
          || (/kind|famil|jeugd|kleuter/.test(genreRaw) ? 'kids'
            : /dj|electro|dance|techno|house|urban|hiphop|hip-hop/.test(genreRaw) ? 'dj'
              : /theater|circus|comedy|humor|straat/.test(genreRaw) ? 'theater'
                : /jazz|klassiek|koor|harmonie|blues/.test(genreRaw) ? 'klassiek'
                  : /world|latin|reggae|afro/.test(genreRaw) ? 'world'
                    : /folk|chanson|gents|volks|café chantant/.test(genreRaw) ? 'folk'
                      : /rock|punk|metal/.test(genreRaw) ? 'rock' : 'pop');
        const age = (val(ageKey && r[ageKey]) || '') + '';
        const kids = genre === 'kids' || /kind|famil|jeugd|kleuter|vlieg/.test(kw) || /^(?:[0-9]|1[0-2])\b/.test(age);
        const ev: any = {
          id: 'l' + i, dag, plein: null, start: h, dur: null, rawDur, genre, titel, loc,
          img: val(imgKey && r[imgKey]) || null, descr: val(descrKey && r[descrKey]) || null,
          url: val(urlKey && r[urlKey]) || null,
          gratis: /true|ja|^1$|gratis/i.test(((val(gratisKey && r[gratisKey]) ?? '') + '').trim()), kids, demo: false
        };
        const catFor = () => /tentoonstell|expo|museum/.test(kw) ? 'Expo’s & musea'
          : /wandel|zoektocht|fiets|route/.test(kw) ? 'Wandelingen & zoektochten'
            : /boot|water|sup|kajak|kano/.test(kw) ? 'Op het water'
              : (rawDur != null && rawDur > 6) ? 'Doorlopend (hele dag)' : 'Elders in de stad';
        const lowLoc = loc.toLowerCase();
        const naamHit = PLEIN_MATCH.find(([, words]) => words.some(w => lowLoc.includes(w)));
        const gLoc = LOCGEO.get(lowLoc.trim()) || null;
        let pleinId: string | null = null;
        if (naamHit) {
          /* 'nabij X' + buiten de zone: niet koppelen; anders blijft de (organisator)groepering
             gelden — het rij-anker volgt per dag toch waar de events echt staan */
          if (!ZWAK.test(loc) || !gLoc || binnenZone(gLoc, naamHit[0])) pleinId = naamHit[0];
        }
        if (!pleinId && gLoc) {
          /* binnen getekende pleinpolygonen = van dat plein; bij meerdere wint de dichtstbijzijnde */
          const polyHits = PLEINEN.filter(pl => {
            const z = PLEIN_ZONES[pl.id];
            return z && z.poly && inPoly(gLoc, z.poly);
          });
          if (polyHits.length === 1) pleinId = polyHits[0].id;
          else if (polyHits.length > 1) {
            pleinId = polyHits.map(pl => {
              const z = zoneVan(pl.id);
              return { id: pl.id, d: Math.min(...z.pts.map(pt => distZ(gLoc, pt))) };
            })
              .sort((a, b) => a.d - b.d)[0].id;
          }
        }
        const echtDoorlopend = /tentoonstell|expo|museum|wandel|zoektocht|fiets|route|boot|water|sup|kajak|kano/.test(kw);
        if (rawDur != null && rawDur > 6 && (!pleinId || echtDoorlopend)) { rest.push(Object.assign(ev, { cat: catFor() })); return; }
        if (pleinId) { ev.plein = pleinId; all.push(ev); }
        else rest.push(Object.assign(ev, { cat: catFor() }));
      });
      /* bron-duplicaten: hetzelfde event staat soms meermaals in de export met
         net verschillende velden (ontsnapt aan de record-dedupe hierboven).
         Zelfde titel+dag+start+locatie = duplicaat; hou het rijkste record
         (echte eindtijd weegt het zwaarst, dan foto, beschrijving, url). */
      let audDubbeleEvents = 0;
      const rijkdom = (e: any) => (e.rawDur != null ? 4 : 0) + (e.img ? 2 : 0) + (e.descr ? 1 : 0) + (e.url ? 1 : 0);
      const dedupEvents = (lijst: any[]) => {
        const byKey = new Map<string, any>();
        lijst.forEach(e => {
          const k = (e.titel + '|' + e.dag + '|' + e.start + '|' + (e.loc || '')).toLowerCase();
          const b = byKey.get(k);
          if (!b) byKey.set(k, e);
          else { audDubbeleEvents++; if (rijkdom(e) > rijkdom(b)) byKey.set(k, e); }
        });
        return [...byKey.values()];
      };
      const allD = dedupEvents(all); all.length = 0; all.push(...allD);
      const restD = dedupEvents(rest); rest.length = 0; rest.push(...restD);

      if (!all.length && !rest.length)
        throw { msg: `${recs.length} records geladen, maar geen enkel event viel binnen 17–26 juli`, dump: recs[0] };

      /* ---- 4. rijen: gekende pleinen met data, aangevuld met drukste overige locaties ---- */
      const withData = new Set(all.map(e => e.plein));
      let rows: any[] = PLEINEN.filter(p => withData.has(p.id));
      const counts: Record<string, number> = {};
      rest.filter(e => e.cat === 'Elders in de stad').forEach(e => { if (e.loc) counts[e.loc] = (counts[e.loc] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topN = Math.max(0, 18 - rows.length);
      sorted.slice(0, topN).forEach(([loc, n]) => {
        const rid = 'loc_' + loc.replace(/\W+/g, '_').toLowerCase();
        rows.push({ id: rid, naam: loc, tag: n + ' activiteiten' });
        rest.forEach(e => { if (e.loc === loc) { e.plein = rid; all.push(e); } });
      });
      /* alle overige locaties met getimede events: eigen rij in de elders-sectie */
      sorted.slice(topN).forEach(([loc, n]) => {
        const rid = 'eld_' + loc.replace(/\W+/g, '_').toLowerCase();
        rows.push({ id: rid, naam: loc, tag: n > 1 ? n + ' activiteiten' : '', sec: 'elders' });
        rest.forEach(e => { if (e.loc === loc) { e.plein = rid; all.push(e); } });
      });
      for (let i = rest.length - 1; i >= 0; i--) if (rest[i].plein) rest.splice(i, 1);

      /* ---- 5. duur bepalen: einde = start van het volgende event op dezelfde rij ---- */
      const byRow: Record<string, any[]> = {};
      all.forEach(e => { (byRow[e.plein + '|' + e.dag] ||= []).push(e); });
      Object.values(byRow).forEach(list => {
        list.sort((a, b) => a.start - b.start);
        list.forEach((e, i) => {
          const next = list[i + 1];
          let dur = e.rawDur;
          if (next && next.start > e.start) {
            const gap = next.start - e.start;
            dur = (dur != null && dur <= gap + .01) ? dur : Math.min(Math.max(gap, .5), 4);
          }
          if (dur == null) dur = 1.25;              // laatste van de avond zonder eindtijd
          e.dur = Math.max(.5, Math.min(dur, 6));
        });
      });
      rest.forEach(e => { if (e.dur == null) e.dur = e.rawDur ?? 1.25; });

      rows = [...rows.filter(r => r.sec !== 'elders'), ...rows.filter(r => r.sec === 'elders')];
      /* rij-ankers per dag: alle plekken waar de events die dag staan,
         geclusterd; het "anker" is de dominante cluster (meeste events),
         maar afstanden rekenen altijd tegen ALLE clusters (dichtstbijzijnde wint) */
      {
        const byRD: Record<string, Record<number, [number, number][]>> = {};
        all.forEach(e => {
          const g = LOCGEO.get((e.loc || '').toLowerCase().trim()); if (!g) return;
          ((byRD[e.plein] ||= {})[e.dag] ||= []).push(g);
        });
        const clusterPts = (pts: [number, number][]) => {
          const R = 111320, cl: { m: [number, number]; pts: [number, number][] }[] = [];
          pts.forEach(p => {
            const c = cl.find(c => Math.hypot((c.m[0] - p[0]) * R, (c.m[1] - p[1]) * R * .63) < 150);
            if (c) { c.pts.push(p); c.m = [c.pts.reduce((a, q) => a + q[0], 0) / c.pts.length, c.pts.reduce((a, q) => a + q[1], 0) / c.pts.length]; }
            else cl.push({ m: [p[0], p[1]], pts: [p] });
          });
          return cl.sort((a, b) => b.pts.length - a.pts.length);
        };
        rows.forEach(rw => {
          rw.dagCoord = {}; rw.dagPts = {};
          const per = byRD[rw.id]; if (!per) return;
          Object.entries(per).forEach(([dg, pts]) => {
            const cl = clusterPts(pts);
            rw.dagCoord[dg] = cl[0].m;              /* dominante cluster: voor de kaartmarker */
            rw.dagPts[dg] = cl.map(c => c.m);       /* alle clusters: voor afstand & sortering */
          });
        });
      }
      store.EVENTS = all; store.LIVE_ROWS = rows; store.LIVE_REST = rest;
      store.loading = false;
      if (dagen) dagen.forEach(d => store.GF_LOADED.add(d));
      if (finaal) {
        store.GF_ALL = true; DAYS.forEach(d => store.GF_LOADED.add(d));
        /* dekkingsaudit: elk opgehaald record verantwoord? */
        const geplaatst = all.length + rest.length;
        const AUDIT = {
          records: recsIn.length, uniek: recs.length, duplicaten: audDuplicaten,
          geplaatst, zonderDatum: audZonderDatum, buitenFeestdagen: audBuitenDagen, dubbeleEvents: audDubbeleEvents,
          onverklaard: recs.length - geplaatst - audZonderDatum - audBuitenDagen - audDubbeleEvents
        };
        window.GF_AUDIT = AUDIT;
        if (AUDIT.onverklaard > 0) console.warn('GF audit: ' + AUDIT.onverklaard + ' records onverklaard kwijt!');
        /* elders-analyse: drukste locaties die geen vast plein zijn */
        const perLoc: Record<string, number> = {};
        all.forEach(e => { if (!PLEINEN.some(p => p.id === e.plein)) { const r2 = rows.find(r => r.id === e.plein); const nm = r2 ? r2.naam : e.loc; if (nm) perLoc[nm] = (perLoc[nm] || 0) + 1; } });
        window.GF_ELDERS = Object.entries(perLoc).sort((a, b) => b[1] - a[1]).slice(0, 25)
          .map(([loc, n]) => ({ locatie: loc, events: n }));
        /* Baudelo-analyse: is Bord de l'Eau een eigen podium of dezelfde zone? */
        const bau = all.filter(e => e.plein === 'baudelo').sort((a, b) => a.dag - b.dag || a.start - b.start);
        if (bau.length) {
          const isBDE = (e: any) => /bord de l/.test((e.loc || '').toLowerCase());
          let overlaps = 0;
          for (const a of bau) for (const b of bau) {
            if (a === b || a.dag !== b.dag) continue;
            if (isBDE(a) && !isBDE(b) && a.start < b.start + b.dur && b.start < a.start + a.dur) overlaps++;
          }
          window.GF_BAUDELO = {
            overlaps, events: bau.map(e => ({
              dag: e.dag, tijd: fmt(e.start) + '–' + fmt(e.start + e.dur),
              locatie: e.loc, titel: e.titel
            }))
          };
        }
        /* algemene groeperingsanalyse: welke locaties horen (geografisch) bij een plein? */
        try {
          const distM = (a: [number, number], b: [number, number]) => {
            const R = 111320;
            const dy = (a[0] - b[0]) * R, dx = (a[1] - b[1]) * R * Math.cos(a[0] * Math.PI / 180);
            return Math.round(Math.hypot(dx, dy));
          };
          const naamVanRij = (id: string | null) => { const r = rows.find(r => r.id === id); return r ? r.naam : (id ? id : 'doorlopend-strook'); };
          const perLoc = new Map<string, { n: number; plein: string | null }>();
          [...all, ...rest].forEach(e => {
            const key = (e.loc || '').trim(); if (!key) return;
            const o = perLoc.get(key) || { n: 0, plein: e.plein };
            o.n++; if (e.plein) o.plein = e.plein;
            perLoc.set(key, o);
          });
          window.GF_GROEPEN = [...perLoc.entries()].map(([loc, o]) => {
            const g = LOCGEO.get(loc.toLowerCase().trim());
            let best: any = null, binnen: any = null; const inZones: string[] = [];
            if (g) {
              PLEINEN.forEach(pl => {
                const z = PLEIN_ZONES[pl.id] || {};
                const zn = zoneVan(pl.id); if (!zn.pts.length) return;
                const d = Math.min(...zn.pts.map(pt => distM(g, pt)));
                const erIn = (z.poly && inPoly(g, z.poly)) || d <= zn.r;
                if (z.poly && inPoly(g, z.poly) && (!binnen || d < binnen.d)) binnen = { naam: pl.naam, id: pl.id, d };
                if (erIn) inZones.push(pl.naam + ' (' + d + 'm)');
                if (!best || d - zn.r < best.d - best.r) best = { naam: pl.naam, id: pl.id, d, r: zn.r };
              });
            }
            const nuRij = naamVanRij(o.plein);
            let voorstel: string;
            if (!g) voorstel = '(geen coördinaten)';
            else if (binnen && o.plein === binnen.id) voorstel = '✓ al gekoppeld';
            else if (binnen && !PLEINEN.some(pl => pl.id === o.plein)) voorstel = '→ SAMENVOEGEN met ' + binnen.naam + '? (BINNEN het plein)';
            else if (best && o.plein === best.id) voorstel = '✓ al gekoppeld';
            else if (best && PLEINEN.some(pl => pl.id === o.plein)) voorstel = '⚠ twee vaste pleinen dicht bijeen (' + best.naam + ' op ' + best.d + 'm)';
            else if (best && best.d <= best.r) voorstel = '→ SAMENVOEGEN met ' + best.naam + '?';
            else if (best && best.d <= best.r + 90) voorstel = '? te checken — dicht bij ' + best.naam;
            else voorstel = 'eigen locatie ok';
            if (inZones.length > 1) voorstel += ' · ⚠ in ' + inZones.length + ' zones: ' + inZones.join(' / ');
            return {
              locatie: loc, events: o.n, nu: nuRij,
              dichtstbij: binnen ? binnen.naam : (best ? best.naam : '—'), afstand_m: binnen ? 0 : (best ? best.d : null),
              straal_m: best ? best.r : null, coord: g ? g[0].toFixed(5) + ', ' + g[1].toFixed(5) : null, voorstel
            };
          }).sort((a, b) => {
            const rang = (v: any) => v.voorstel.startsWith('→') ? 0 : (v.voorstel.startsWith('?') ? 1 : (v.voorstel.startsWith('(') ? 3 : 2));
            return rang(a) - rang(b) || b.events - a.events;
          });
          console.info('%cGF groeperingsanalyse — kandidaten voor samenvoegen bovenaan (→), daarna twijfelgevallen (?)', 'font-weight:bold');
          console.table(window.GF_GROEPEN as any[]);
        } catch (err) { console.warn('GF groeperingsanalyse mislukt:', err); }
      }
      setStatus(finaal
        ? (all.length
          ? `live · ${all.length} in het raster · ${rest.length} elders`
          : `live · niet gekoppeld — diagnose open`)
        : `vandaag geladen · week volgt…`);
      if (finaal && !all.length) {
        /* diagnosepaneel: velddetectie-keuzes + voorbeeldrecord (React rendert dit) */
        const locSamples = [...new Set(rest.slice(0, 40).map(e => e.loc).filter(Boolean))].slice(0, 10) as string[];
        store.diagnose = {
          used, recsLength: recs.length,
          keys: { titleKey, isoStartKey, isoEndKey, dateKey, dagKey, startKey, endKey, locKey, genreKey, endMode },
          locSamples, sample: scan[0],
        };
      }
      notify();
    };

    /* volledige dataset in de dagcache (alleen na een echte netwerklading) */
    const bewaar = (r: any[]) => { void cacheZet({ buildId: BUILD_ID, dagKey: dagKeyNu(), fetchedAt: Date.now(), used, recs: r, locRecs, thRecs }); };

    /* fase A verwerken: de app is meteen bruikbaar met het programma van vandaag */
    verwerk(recs!, !progressief, progressief ? [feestVandaag] : null);
    if (!progressief && !uitCache) bewaar(recs!); /* volledige-lading-fallback */
    if (progressief) {
      let alleRecs = recs!;
      /* fase B: morgen erbij */
      const morgen = DAYS[DAYS.indexOf(feestVandaag) + 1];
      if (morgen) {
        try {
          const recsB = await fetchPaged(used, null, whereDag(morgen));
          if (recsB && recsB.length) { alleRecs = [...alleRecs, ...recsB]; verwerk(alleRecs, false, [feestVandaag, morgen]); }
        } catch (_) {/* achtergrond */ }
      }
      /* fase C: volledige dataset (vervangt alles — garandeert identiek eindresultaat) */
      try {
        const recsC = await fetchPaged(used, null, null);
        if (recsC && recsC.length) { verwerk(recsC, true, null); bewaar(recsC); }
      } catch (_) { store.GF_ALL = true; DAYS.forEach(d => store.GF_LOADED.add(d)); notify(); }
    }
  } catch (err: any) {
    if (err && err.dump) console.warn('Voorbeeldrecord open data:', err.dump);
    store.loading = false;
    store.loadError = err && err.msg ? err.msg
      : 'Geen verbinding met data.stad.gent. In een afgeschermde preview is dit normaal — download de pagina en open ze lokaal in je browser.';
    setStatus('niet geladen');
    notify();
  }
}
